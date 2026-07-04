import pytest
import threading
import time
import os
from datetime import datetime, timedelta

# Set environment variable before importing app to avoid initializing PostgreSQL
os.environ['DATABASE_URL'] = 'sqlite:///file:test_concurrency?mode=memory&cache=shared&uri=true'

from app import create_app
from app.database import db
from app.models import Queue, Job, Worker, Project, Organization, RetryPolicy
from app.worker import WorkerDaemon
from app.utils.backoff import calculate_next_retry

@pytest.fixture
def app():
    """Isolated SQLite in-memory test database fixture using shared cache."""
    app = create_app()
    app.config.update({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///file:test_concurrency?mode=memory&cache=shared&uri=true',
        'MAX_RETRY_DELAY_CAP': 30,
        'SQLALCHEMY_ENGINE_OPTIONS': {'connect_args': {'timeout': 30}}
    })
    
    with app.app_context():
        # Setup tables on SQLite
        db.create_all()
        from sqlalchemy import text
        try:
            db.session.execute(text("PRAGMA journal_mode=WAL;"))
            db.session.commit()
        except Exception:
            pass
        
        # Seed basic project structure
        org = Organization(name="Test Org")
        db.session.add(org)
        db.session.commit()
        
        proj = Project(name="Test Project", organization_id=org.id)
        db.session.add(proj)
        db.session.commit()
        
        policy = RetryPolicy(name="Test Policy", strategy="EXPONENTIAL", backoff_interval=5, max_retries=3, project_id=proj.id)
        db.session.add(policy)
        db.session.commit()
        
        queue = Queue(name="Test Queue", project_id=proj.id, retry_policy_id=policy.id)
        db.session.add(queue)
        db.session.commit()
        
        yield app
        db.session.remove()
        db.drop_all()

def test_concurrent_job_claiming(app):
    """
    Spins up multiple threads simulating separate workers claiming the SAME job concurrently.
    Asserts exactly one worker succeeds in claiming it and others receive None.
    """
    with app.app_context():
        queue = Queue.query.first()
        job = Job(
            queue_id=queue.id,
            status='QUEUED',
            payload='{"type":"GENERIC"}',
            priority=5
        )
        db.session.add(job)
        db.session.commit()
        job_id = job.id

    results = []
    def worker_claim(worker_name):
        with app.app_context():
            daemon = WorkerDaemon(app, worker_id=worker_name)
            claimed = daemon._claim_next_job()
            if claimed:
                results.append((worker_name, claimed.id))

    # Spin up 10 threads simulating concurrent workers
    threads = [threading.Thread(target=worker_claim, args=(f"worker-{i}",)) for i in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # Verify exactly one worker successfully claimed the job
    assert len(results) == 1
    assert results[0][1] == job_id

def test_backoff_calculation_with_cap(app):
    """
    Verifies fixed, linear, and exponential backoff calculations.
    Asserts exponential backoff respects the configured maximum delay cap.
    """
    # 1. FIXED strategy: delay remains constant at backoff_interval
    t_fixed = calculate_next_retry('FIXED', 5, 2)
    diff_fixed = (t_fixed - datetime.utcnow()).total_seconds()
    assert 4 <= diff_fixed <= 6

    # 2. LINEAR strategy: delay = backoff_interval * retry_count (5 * 3 = 15s)
    t_linear = calculate_next_retry('LINEAR', 5, 3)
    diff_linear = (t_linear - datetime.utcnow()).total_seconds()
    assert 14 <= diff_linear <= 16

    # 3. EXPONENTIAL strategy: delay = backoff_interval * (2^(retry_count - 1)) (5 * 2^2 = 20s)
    t_expo = calculate_next_retry('EXPONENTIAL', 5, 3)
    diff_expo = (t_expo - datetime.utcnow()).total_seconds()
    assert 19 <= diff_expo <= 21

    # 4. EXPONENTIAL with delay cap (capped at 10s instead of 40s)
    t_capped = calculate_next_retry('EXPONENTIAL', 5, 4, max_delay_cap=10)
    diff_capped = (t_capped - datetime.utcnow()).total_seconds()
    assert 9 <= diff_capped <= 11

def test_worker_heartbeat_timeout_recovery(app):
    """
    Simulates worker heartbeat timeout.
    Asserts orphan recovery sweep resets stale worker jobs to QUEUED,
    increments the retry counter (current behavior), and marks the worker INACTIVE.
    """
    with app.app_context():
        queue = Queue.query.first()
        
        # Stale worker (last heartbeat 45 seconds ago)
        stale_worker = Worker(
            id='worker-stale',
            name='worker-stale',
            host='host-stale',
            status='ACTIVE',
            last_heartbeat=datetime.utcnow() - timedelta(seconds=45)
        )
        db.session.add(stale_worker)
        
        # Active current worker doing the recovery
        current_worker = Worker(
            id='worker-current',
            name='worker-current',
            host='host-current',
            status='ACTIVE',
            last_heartbeat=datetime.utcnow()
        )
        db.session.add(current_worker)
        
        # Job running on the stale worker
        job = Job(
            queue_id=queue.id,
            status='RUNNING',
            worker_id='worker-stale',
            payload='{"type":"GENERIC"}',
            priority=5
        )
        db.session.add(job)
        db.session.commit()
        job_id = job.id

        # Execute stale recovery sweep
        daemon = WorkerDaemon(app, worker_id='worker-current')
        daemon._recover_stale_workers()
        
        # Verify database updates
        updated_worker = db.session.get(Worker, 'worker-stale')
        updated_job = db.session.get(Job, job_id)
        assert updated_worker.status == 'INACTIVE'
        assert updated_job.status == 'QUEUED'
        assert updated_job.worker_id is None
        assert updated_job.retry_count == 1

def test_job_idempotency_bypass(app):
    """
    Verifies that if a completed execution with the same idempotency_key already exists,
    the worker skips running the task logic and marks the execution successful.
    """
    with app.app_context():
        from app.models import Queue, Job, JobExecution
        queue = Queue.query.first()
        
        # 1. Create a job with an idempotency key
        job = Job(
            queue_id=queue.id,
            status='QUEUED',
            payload='{"type":"HTTP","url":"https://example.com/fail"}',
            priority=5,
            idempotency_key='test-key-123'
        )
        db.session.add(job)
        db.session.commit()
        job_id = job.id
        
        # 2. Create a previous successful execution for the same key
        prev_exec = JobExecution(
            job_id=job_id,
            worker_id='worker-old',
            status='COMPLETED',
            idempotency_key='test-key-123'
        )
        db.session.add(prev_exec)
        db.session.commit()
        
        # 3. Trigger worker execution wrapper
        daemon = WorkerDaemon(app, worker_id='worker-current')
        daemon._execute_job_wrapper(job_id)
        
        # 4. Assert that job is marked COMPLETED
        updated_job = db.session.get(Job, job_id)
        assert updated_job.status == 'COMPLETED'
        
        # 5. Assert that a new execution was logged, marked COMPLETED, containing the idempotency key
        new_exec = JobExecution.query.filter(
            JobExecution.job_id == job_id,
            JobExecution.worker_id == 'worker-current'
        ).first()
        assert new_exec is not None
        assert new_exec.status == 'COMPLETED'
        assert new_exec.idempotency_key == 'test-key-123'

def test_extended_observability_endpoints(app):
    """
    Verifies that the new latency percentiles and queue depth snapshot routes
    compute metrics correctly and return valid SRE telemetry.
    """
    from flask_jwt_extended import create_access_token
    from app.models import User, JobExecution, QueueDepthSnapshot
    
    with app.app_context():
        # 1. Register a test user
        org = Organization.query.first()
        user = User(email="sre-operator@company.com", organization_id=org.id)
        user.set_password("securepassword")
        db.session.add(user)
        db.session.commit()
        
        token = create_access_token(identity=user.id)
        queue = Queue.query.first()
        
        # 2. Seed some completed executions with mock latency values (100ms, 200ms, 300ms)
        for i, duration in enumerate([100, 200, 300]):
            job = Job(queue_id=queue.id, status='COMPLETED', payload='{"type":"GENERIC"}', priority=5)
            db.session.add(job)
            db.session.commit()
            
            execution = JobExecution(
                job_id=job.id,
                worker_id='worker-1',
                status='COMPLETED',
                duration_ms=duration,
                started_at=datetime.utcnow() - timedelta(minutes=5),
                finished_at=datetime.utcnow()
            )
            db.session.add(execution)
        
        # 3. Seed a queue depth snapshot
        snapshot = QueueDepthSnapshot(queue_id=queue.id, depth=4, timestamp=datetime.utcnow())
        db.session.add(snapshot)
        db.session.commit()

    # 4. Make requests using Flask test client
    client = app.test_client()
    headers = {'Authorization': f'Bearer {token}'}
    
    # Check latency endpoint
    resp_lat = client.get('/api/metrics/latency', headers=headers)
    assert resp_lat.status_code == 200
    data_lat = resp_lat.get_json()
    assert data_lat['success'] is True
    # In list [100, 200, 300], count is 3:
    # idx for P50 = int(3 * 0.50) = 1 -> 200
    # idx for P95 = int(3 * 0.95) = 2 -> 300
    # idx for P99 = int(3 * 0.99) = 2 -> 300
    assert data_lat['p50'] == 200.0
    assert data_lat['p95'] == 300.0
    assert data_lat['p99'] == 300.0
    assert data_lat['count'] == 3

    # Check queue-depth endpoint
    resp_depth = client.get('/api/metrics/queue-depth', headers=headers)
    assert resp_depth.status_code == 200
    data_depth = resp_depth.get_json()
    assert data_depth['success'] is True
    assert len(data_depth['data']) == 1
    assert data_depth['data'][0]['depth'] == 4
    assert data_depth['data'][0]['queue_name'] == 'Test Queue'

def test_token_bucket_rate_limiting(app):
    """
    Verifies that the API rate limiter allows job submission requests up to the configured
    capacity, and returns 429 Too Many Requests once the token bucket is exhausted.
    """
    from flask_jwt_extended import create_access_token
    from app.models import User
    
    # Update config to limit bucket to 2 requests and disable refill
    app.config['RATE_LIMIT_BUCKET_CAPACITY'] = 2
    app.config['RATE_LIMIT_REFILL_RATE'] = 0.0
    
    with app.app_context():
        # Register a test user
        org = Organization.query.first()
        user = User(email="sre-operator@company.com", organization_id=org.id)
        user.set_password("securepassword")
        db.session.add(user)
        db.session.commit()
        
        token = create_access_token(identity=user.id)
        queue = Queue.query.first()
        queue_id = queue.id
        
    client = app.test_client()
    headers = {'Authorization': f'Bearer {token}'}
    payload = {
        'queue_id': queue_id,
        'payload': {'type': 'GENERIC', 'duration': 1.0}
    }
    
    # 1. First request -> Success (Consume token 1)
    resp1 = client.post('/api/jobs/', json=payload, headers=headers)
    assert resp1.status_code == 201
    
    # 2. Second request -> Success (Consume token 2)
    resp2 = client.post('/api/jobs/', json=payload, headers=headers)
    assert resp2.status_code == 201
    
    # 3. Third request -> Rate limited (Bucket empty)
    resp3 = client.post('/api/jobs/', json=payload, headers=headers)
    assert resp3.status_code == 429
    data3 = resp3.get_json()
    assert data3['success'] is False
    assert 'Rate limit exceeded' in data3['message']



