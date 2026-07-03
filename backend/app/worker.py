import os
import json
import time
import logging
import threading
import traceback
from datetime import datetime
import http.client
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from app.database import db
from app.models import Worker, Queue, Job, JobExecution, JobLog, DeadLetterQueueEntry, RecurringJob
from app.utils.backoff import calculate_next_retry
from app.utils.cron import get_next_cron_time

# Configure logging
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s in %(module)s: %(message)s')
logger = logging.getLogger(__name__)

class WorkerDaemon:
    def __init__(self, app, worker_id=None, max_concurrency=10, poll_interval=1.0, heartbeat_interval=5.0):
        self.app = app
        self.worker_id = worker_id or os.environ.get('WORKER_NAME', f'worker-{os.getpid()}')
        self.max_concurrency = max_concurrency
        self.poll_interval = poll_interval
        self.heartbeat_interval = heartbeat_interval
        self.running = False
        
        self.executor = ThreadPoolExecutor(max_workers=self.max_concurrency)
        self.active_jobs = {} # job_id -> future object
        self.active_jobs_lock = threading.Lock()
        
        self.poll_thread = None
        self.heartbeat_thread = None
        self.cron_thread = None

    def start(self):
        """Starts the worker daemon background threads."""
        logger.info(f"Starting Worker Daemon [{self.worker_id}]...")
        self.running = True
        
        # Register worker in DB
        with self.app.app_context():
            self._register_worker()
            self._recover_stale_workers()

        # Start background loop threads
        self.poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self.heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self.cron_thread = threading.Thread(target=self._cron_loop, daemon=True)

        self.poll_thread.start()
        self.heartbeat_thread.start()
        self.cron_thread.start()
        logger.info(f"Worker Daemon [{self.worker_id}] started successfully.")

    def stop(self):
        """Gracefully shuts down the worker daemon."""
        logger.info(f"Shutting down Worker Daemon [{self.worker_id}] gracefully...")
        self.running = False
        
        # Shut down executor and wait for running tasks to complete
        self.executor.shutdown(wait=True)
        
        # Mark worker as INACTIVE in DB
        with self.app.app_context():
            try:
                worker = Worker.query.get(self.worker_id)
                if worker:
                    worker.status = 'INACTIVE'
                    db.session.commit()
                    logger.info(f"Worker [{self.worker_id}] status marked as INACTIVE.")
            except Exception as e:
                logger.error(f"Error marking worker status as INACTIVE: {e}")
                db.session.rollback()

    def _register_worker(self):
        """Registers the worker in the DB database."""
        try:
            worker = Worker.query.get(self.worker_id)
            if not worker:
                worker = Worker(
                    id=self.worker_id,
                    name=self.worker_id,
                    host=os.uname().nodename if hasattr(os, 'uname') else os.environ.get('COMPUTERNAME', 'localhost'),
                    status='ACTIVE',
                    last_heartbeat=datetime.utcnow()
                )
                db.session.add(worker)
            else:
                worker.status = 'ACTIVE'
                worker.last_heartbeat = datetime.utcnow()
            db.session.commit()
            logger.info(f"Registered worker [{self.worker_id}] in database.")
        except Exception as e:
            logger.error(f"Failed to register worker in database: {e}")
            db.session.rollback()

    def _recover_stale_workers(self):
        """
        Scans for workers that haven't sent a heartbeat for more than 30 seconds,
        marks them as INACTIVE, and reschedules their abandoned jobs.
        """
        try:
            now = datetime.utcnow()
            stale_threshold = 30 # seconds
            
            # Find stale active workers
            stale_workers = Worker.query.filter(
                Worker.status == 'ACTIVE',
                Worker.id != self.worker_id
            ).all()
            
            recovered_count = 0
            for w in stale_workers:
                delta = (now - w.last_heartbeat).total_seconds()
                if delta > stale_threshold:
                    logger.warning(f"Worker [{w.id}] is stale (last heartbeat {delta}s ago). Recovering jobs...")
                    w.status = 'INACTIVE'
                    
                    # Find jobs claimed/running by this worker
                    abandoned_jobs = Job.query.filter(
                        Job.status.in_(['CLAIMED', 'RUNNING']),
                        Job.worker_id == w.id
                    ).all()
                    
                    for job in abandoned_jobs:
                        job.status = 'QUEUED'
                        job.worker_id = None
                        job.retry_count += 1
                        job.last_error = "Recovered from stale/crashed worker."
                        recovered_count += 1
                        
                        logger.info(f"Rescheduled abandoned Job [{job.id}] back to QUEUED.")
            
            if recovered_count > 0 or len(stale_workers) > 0:
                db.session.commit()
                logger.info(f"Stale worker recovery complete. Recovered {recovered_count} jobs.")
        except Exception as e:
            logger.error(f"Error during stale worker recovery: {e}")
            db.session.rollback()

    def _heartbeat_loop(self):
        """Periodic heartbeat loop."""
        while self.running:
            try:
                time.sleep(self.heartbeat_interval)
                if not self.running:
                    break
                
                with self.app.app_context():
                    worker = Worker.query.get(self.worker_id)
                    if worker:
                        worker.last_heartbeat = datetime.utcnow()
                        worker.status = 'ACTIVE'
                        db.session.commit()
                        
                        # Also run stale worker recovery periodically from one worker
                        self._recover_stale_workers()
            except Exception as e:
                logger.error(f"Error in heartbeat loop: {e}")

    def _cron_loop(self):
        """Checks recurring jobs and enqueues new Job instances when scheduled."""
        while self.running:
            try:
                time.sleep(2.0) # Check cron schedules every 2 seconds
                if not self.running:
                    break

                with self.app.app_context():
                    now = datetime.utcnow()
                    # Find recurring jobs that need execution
                    active_recurring = RecurringJob.query.filter(
                        RecurringJob.is_active == True,
                        RecurringJob.next_run_at <= now
                    ).all()

                    for r_job in active_recurring:
                        logger.info(f"Cron Trigger: recurring job '{r_job.name}' is due. Enqueuing new job instance...")
                        
                        # Spawn job instance
                        new_job = Job(
                            queue_id=r_job.queue_id,
                            status='QUEUED',
                            payload=r_job.payload,
                            priority=r_job.priority,
                            max_retries=3,
                            run_at=None
                        )
                        db.session.add(new_job)

                        # Update next execution time
                        r_job.next_run_at = get_next_cron_time(r_job.cron_expression, now)
                        logger.info(f"Next schedule for '{r_job.name}': {r_job.next_run_at}")

                    if active_recurring:
                        db.session.commit()
            except Exception as e:
                logger.error(f"Error in cron processing loop: {e}")
                with self.app.app_context():
                    db.session.rollback()

    def _poll_loop(self):
        """Worker polling loop that retrieves jobs from Postgres."""
        while self.running:
            try:
                with self.active_jobs_lock:
                    current_running_count = len(self.active_jobs)
                
                # Check if we have capacity
                if current_running_count >= self.max_concurrency:
                    time.sleep(self.poll_interval)
                    continue

                with self.app.app_context():
                    job = self._claim_next_job()
                    if job:
                        # Spawning thread for execution
                        job_id = job.id
                        future = self.executor.submit(self._execute_job_wrapper, job_id)
                        with self.active_jobs_lock:
                            self.active_jobs[job_id] = future
                    else:
                        # No jobs found, sleep before polling again
                        time.sleep(self.poll_interval)
            except Exception as e:
                logger.error(f"Error in poll loop: {e}")
                time.sleep(self.poll_interval)

    def _claim_next_job(self):
        """
        Atomically queries and claims the next job.
        Considers: queue priorities, job priorities, queue concurrency limits, and paused status.
        """
        # Step 1: Get all queues and calculate how many jobs are currently running/claimed per queue
        active_queues = Queue.query.filter(Queue.is_paused == False).all()
        if not active_queues:
            return None

        # Check concurrency for each active queue
        eligible_queue_ids = []
        for queue in active_queues:
            running_jobs_count = Job.query.filter(
                Job.queue_id == queue.id,
                Job.status.in_(['CLAIMED', 'RUNNING'])
            ).count()
            
            if running_jobs_count < queue.max_concurrency:
                eligible_queue_ids.append(queue.id)

        if not eligible_queue_ids:
            return None

        # Step 2: Query for next QUEUED / SCHEDULED job within eligible queues
        # Use Postgres SKIP LOCKED row locking to claim atomically
        now = datetime.utcnow()
        
        # Subquery to lock and fetch exactly one eligible job ID
        # Order by Queue Priority DESC, Job Priority DESC, Created At ASC
        subquery = db.session.query(Job.id)\
            .join(Queue, Job.queue_id == Queue.id)\
            .filter(
                Job.status.in_(['QUEUED', 'SCHEDULED']),
                Job.queue_id.in_(eligible_queue_ids),
                db.or_(Job.run_at == None, Job.run_at <= now)
            )\
            .order_by(Queue.priority.desc(), Job.priority.desc(), Job.created_at.asc())\
            .limit(1)\
            .with_for_update(skip_locked=True)\
            .scalar_subquery()

        # Update and return in one atomic transaction
        job = Job.query.filter(Job.id == subquery).first()
        if job:
            job.status = 'CLAIMED'
            job.worker_id = self.worker_id
            job.updated_at = datetime.utcnow()
            db.session.commit()
            try:
                from app.ws import broadcast_event
                broadcast_event('job_updated', job.to_dict())
            except Exception:
                pass
            logger.info(f"Worker [{self.worker_id}] atomically claimed Job [{job.id}] from Queue [{job.queue.name}]")
            return job

        return None

    def _execute_job_wrapper(self, job_id):
        """Runs inside a thread pool worker to orchestrate execution, logs, retries and state."""
        try:
            with self.app.app_context():
                job = Job.query.get(job_id)
                if not job:
                    return

                # Store payload and max_retries locally before committing and closing session
                payload_str = job.payload
                max_retries = job.max_retries

                # Move status to RUNNING
                job.status = 'RUNNING'
                job.updated_at = datetime.utcnow()
                
                # Create execution record
                execution = JobExecution(
                    job_id=job.id,
                    worker_id=self.worker_id,
                    status='RUNNING',
                    started_at=datetime.utcnow()
                )
                db.session.add(execution)
                db.session.commit()
                try:
                    from app.ws import broadcast_event
                    broadcast_event('job_updated', job.to_dict())
                except Exception:
                    pass
                execution_id = execution.id

            # Execute actual task logic outside of transaction lock to prevent holding DB transactions open
            start_time = time.time()
            success = False
            error_message = None
            logs = []

            def append_log(level, msg):
                logs.append((level, msg))
                logger.info(f"Job [{job_id}] - {level}: {msg}")

            try:
                append_log("INFO", f"Starting execution of Job [{job_id}]")
                payload_data = json.loads(payload_str)
                
                # Execute based on job payload type
                job_type = payload_data.get("type", "GENERIC")
                
                if job_type == "HTTP":
                    url_str = payload_data.get("url")
                    method = payload_data.get("method", "GET").upper()
                    headers = payload_data.get("headers", {})
                    body = payload_data.get("body", "")

                    if not url_str:
                        raise ValueError("HTTP jobs require a 'url' parameter in payload")

                    append_log("INFO", f"Executing HTTP {method} webhook request to: {url_str}")
                    
                    # Parse URL
                    parsed_url = urllib.parse.urlparse(url_str)
                    host = parsed_url.netloc
                    path = parsed_url.path or "/"
                    if parsed_url.query:
                        path += "?" + parsed_url.query

                    # Determine HTTPS vs HTTP
                    conn = None
                    if parsed_url.scheme == "https":
                        conn = http.client.HTTPSConnection(host, timeout=10)
                    else:
                        conn = http.client.HTTPConnection(host, timeout=10)
                    
                    headers["User-Agent"] = "JobSphereScheduler/1.0"
                    if body and "Content-Type" not in headers:
                        headers["Content-Type"] = "application/json"
                        
                    conn.request(method, path, body=body, headers=headers)
                    resp = conn.getresponse()
                    resp_data = resp.read().decode('utf-8')
                    
                    append_log("INFO", f"HTTP Response Status: {resp.status}")
                    append_log("INFO", f"HTTP Response Body Preview: {resp_data[:200]}")
                    
                    if resp.status >= 400:
                        raise Exception(f"HTTP request failed with status code {resp.status}: {resp_data[:100]}")
                    success = True

                elif job_type == "EMAIL":
                    to_email = payload_data.get("to")
                    subject = payload_data.get("subject")
                    body = payload_data.get("body")
                    
                    if not to_email or not subject:
                        raise ValueError("EMAIL jobs require 'to' and 'subject' parameters in payload")
                        
                    append_log("INFO", f"Sending Email mock to: {to_email}")
                    append_log("INFO", f"Subject: {subject}")
                    time.sleep(1.0) # Simulate network transmission delay
                    append_log("INFO", "Email Mock transmitted successfully")
                    success = True

                elif job_type == "COMPUTE":
                    # Simulated heavy workload
                    steps = payload_data.get("steps", 5)
                    append_log("INFO", f"Running heavy compute task for {steps} cycles...")
                    for i in range(steps):
                        time.sleep(0.5)
                        append_log("INFO", f"Compute cycle {i+1}/{steps} finished")
                    success = True

                else: # GENERIC
                    duration = payload_data.get("duration", 2.0)
                    append_log("INFO", f"Generic background job sleep simulation for {duration} seconds...")
                    time.sleep(duration)
                    append_log("INFO", "Generic job simulation finished")
                    success = True

            except Exception as e:
                success = False
                error_message = str(e)
                append_log("ERROR", f"Job failed with error: {error_message}")
                append_log("ERROR", traceback.format_exc())

            duration_ms = int((time.time() - start_time) * 1000)

            # Re-open session and update database state
            with self.app.app_context():
                job = Job.query.get(job_id)
                execution = JobExecution.query.get(execution_id)
                
                # Write logs to database
                for log_level, log_msg in logs:
                    db_log = JobLog(execution_id=execution_id, log_level=log_level, message=log_msg)
                    db.session.add(db_log)

                execution.duration_ms = duration_ms
                execution.finished_at = datetime.utcnow()

                if success:
                    job.status = 'COMPLETED'
                    job.completed_at = datetime.utcnow()
                    execution.status = 'COMPLETED'
                    logger.info(f"Job [{job_id}] completed successfully in {duration_ms}ms")

                    # --- Workflow Dependencies: Unlock Child Jobs ---
                    for child in job.children:
                        if child.status == 'BLOCKED':
                            # Check if all other parents of this child are completed
                            other_parents_completed = all(p.status == 'COMPLETED' for p in child.parents)
                            if other_parents_completed:
                                child.status = 'QUEUED'
                                child.updated_at = datetime.utcnow()
                                logger.info(f"Dependency Met: Unlocked dependent Job [{child.id}] -> status set to QUEUED.")
                else:
                    execution.status = 'FAILED'
                    execution.error_message = error_message
                    job.last_error = error_message
                    
                    # Handle retry logic
                    if job.retry_count < max_retries:
                        job.retry_count += 1
                        job.status = 'SCHEDULED'
                        # Get retry policy from queue
                        queue = job.queue
                        strategy = 'FIXED'
                        backoff = 5
                        if queue and queue.retry_policy:
                            strategy = queue.retry_policy.strategy
                            backoff = queue.retry_policy.backoff_interval
                        
                        next_run = calculate_next_retry(strategy, backoff, job.retry_count)
                        job.run_at = next_run
                        logger.info(f"Job [{job_id}] failed. Scheduled retry #{job.retry_count} for: {next_run}")
                    else:
                        # Permanent failure - Move to Dead Letter Queue (DLQ)
                        job.status = 'FAILED_DLQ'
                        dlq_entry = DeadLetterQueueEntry(
                            original_job_id=job.id,
                            queue_id=job.queue_id,
                            payload=payload_str,
                            last_error=error_message
                        )
                        db.session.add(dlq_entry)
                        logger.error(f"Job [{job_id}] failed permanently after {job.retry_count} retries. Moved to DLQ.")

                        # --- Workflow Dependencies: Fail Child Jobs recursively ---
                        def cascade_dependency_failure(parent_job):
                            for child in parent_job.children:
                                if child.status in ['BLOCKED', 'QUEUED', 'SCHEDULED']:
                                    child.status = 'FAILED_DEPENDENCY'
                                    child.last_error = f"Dependency parent Job [{parent_job.id}] failed permanently."
                                    child.updated_at = datetime.utcnow()
                                    logger.warning(f"Dependency Failed: Job [{child.id}] status set to FAILED_DEPENDENCY due to parent [{parent_job.id}] failure.")
                                    cascade_dependency_failure(child)

                        cascade_dependency_failure(job)
                
                db.session.commit()
                try:
                    from app.ws import broadcast_event
                    broadcast_event('scheduler_update')
                except Exception:
                    pass

        except Exception as e:
            logger.error(f"Critical error in job execution wrapper: {e}")
        finally:
            with self.active_jobs_lock:
                if job_id in self.active_jobs:
                    del self.active_jobs[job_id]
