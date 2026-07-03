import uuid
from datetime import datetime, timedelta
import json
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.database import db
from app.models import User, Project, Queue, Job, JobExecution, JobLog, RecurringJob, DeadLetterQueueEntry
from app.utils.cron import get_next_cron_time

jobs_bp = Blueprint('jobs', __name__)

def get_user_project(user_id):
    user = User.query.get(user_id)
    if not user:
        return None
    return Project.query.filter_by(organization_id=user.organization_id).first()


@jobs_bp.route('/', methods=['POST'])
@jwt_required()
def create_job():
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    data = request.get_json() or {}
    queue_id = data.get('queue_id')
    payload = data.get('payload') # JSON payload (dict or raw string)
    priority = data.get('priority', 1)
    delay_seconds = data.get('delay_seconds')
    run_at_str = data.get('run_at') # ISO string
    depends_on = data.get('depends_on', []) # List of parent job IDs

    # Validation
    if not queue_id or not payload:
        return jsonify({'success': False, 'message': 'queue_id and payload are required'}), 400

    # Ensure queue belongs to the project
    queue = Queue.query.filter_by(id=queue_id, project_id=project.id).first()
    if not queue:
        return jsonify({'success': False, 'message': 'Queue not found'}), 404

    # Validate dependencies (parents)
    parents = []
    if depends_on:
        parents = Job.query.join(Queue).filter(Job.id.in_(depends_on), Queue.project_id == project.id).all()
        if len(parents) != len(depends_on):
            return jsonify({'success': False, 'message': 'One or more dependency parent jobs were not found in this project'}), 400

    # Convert payload dict to string if necessary
    if isinstance(payload, dict):
        payload_str = json.dumps(payload)
    else:
        payload_str = str(payload)

    # Determine run_at & initial status
    run_at = None
    status = 'QUEUED'
    if delay_seconds is not None:
        run_at = datetime.utcnow() + timedelta(seconds=int(delay_seconds))
        status = 'SCHEDULED'
    elif run_at_str:
        try:
            # Parse ISO-8601 string
            run_at = datetime.fromisoformat(run_at_str.replace('Z', '+00:00')).replace(tzinfo=None)
            status = 'SCHEDULED'
        except ValueError:
            return jsonify({'success': False, 'message': 'Invalid ISO date format for run_at'}), 400

    # If job has parents, determine dependency blocks
    if parents:
        any_failed = any(p.status in ['FAILED_DLQ', 'FAILED_DEPENDENCY'] for p in parents)
        if any_failed:
            status = 'FAILED_DEPENDENCY'
        else:
            all_completed = all(p.status == 'COMPLETED' for p in parents)
            if not all_completed:
                status = 'BLOCKED'

    try:
        job = Job(
            queue_id=queue.id,
            status=status,
            payload=payload_str,
            priority=int(priority),
            run_at=run_at,
            max_retries=queue.retry_policy.max_retries if queue.retry_policy else 3
        )
        if parents:
            job.parents.extend(parents)
            
        db.session.add(job)
        db.session.commit()
        try:
            from app.ws import broadcast_event
            broadcast_event('job_created', job.to_dict())
        except Exception:
            pass
        return jsonify({'success': True, 'job': job.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Job creation failed: {str(e)}'}), 500


@jobs_bp.route('/batch', methods=['POST'])
@jwt_required()
def create_batch_jobs():
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    data = request.get_json() or {}
    queue_id = data.get('queue_id')
    payloads = data.get('payloads', []) # List of payloads
    priority = data.get('priority', 1)

    if not queue_id or not payloads:
        return jsonify({'success': False, 'message': 'queue_id and a non-empty list of payloads are required'}), 400

    queue = Queue.query.filter_by(id=queue_id, project_id=project.id).first()
    if not queue:
        return jsonify({'success': False, 'message': 'Queue not found'}), 404

    batch_id = str(uuid.uuid4())
    created_jobs = []

    try:
        for p in payloads:
            p_str = json.dumps(p) if isinstance(p, dict) else str(p)
            job = Job(
                queue_id=queue.id,
                status='QUEUED',
                payload=p_str,
                priority=int(priority),
                batch_id=batch_id,
                max_retries=queue.retry_policy.max_retries if queue.retry_policy else 3
            )
            db.session.add(job)
            created_jobs.append(job)
            
        db.session.commit()
        try:
            from app.ws import broadcast_event
            broadcast_event('jobs_created', [j.to_dict() for j in created_jobs])
        except Exception:
            pass
        return jsonify({
            'success': True, 
            'batch_id': batch_id,
            'count': len(created_jobs),
            'jobs': [j.to_dict() for j in created_jobs]
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Batch creation failed: {str(e)}'}), 500


# --- Recurring / Cron Jobs ---
@jobs_bp.route('/recurring', methods=['GET'])
@jwt_required()
def get_recurring_jobs():
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    r_jobs = RecurringJob.query.join(Queue).filter(Queue.project_id == project.id).all()
    return jsonify({
        'success': True,
        'recurring_jobs': [r.to_dict() for r in r_jobs]
    }), 200


@jobs_bp.route('/recurring', methods=['POST'])
@jwt_required()
def create_recurring_job():
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    data = request.get_json() or {}
    name = data.get('name')
    queue_id = data.get('queue_id')
    cron_expression = data.get('cron_expression') # e.g. "*/5 * * * *"
    payload = data.get('payload')
    priority = data.get('priority', 1)

    if not name or not queue_id or not cron_expression or not payload:
        return jsonify({'success': False, 'message': 'Missing required fields'}), 400

    queue = Queue.query.filter_by(id=queue_id, project_id=project.id).first()
    if not queue:
        return jsonify({'success': False, 'message': 'Queue not found'}), 404

    p_str = json.dumps(payload) if isinstance(payload, dict) else str(payload)

    try:
        # Validate cron expression and calculate first run
        next_run = get_next_cron_time(cron_expression)
        
        r_job = RecurringJob(
            name=name,
            queue_id=queue.id,
            cron_expression=cron_expression,
            payload=p_str,
            priority=int(priority),
            next_run_at=next_run
        )
        db.session.add(r_job)
        db.session.commit()
        return jsonify({'success': True, 'recurring_job': r_job.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Cron creation failed: {str(e)}'}), 500


@jobs_bp.route('/recurring/<r_id>/toggle', methods=['POST'])
@jwt_required()
def toggle_recurring_job(r_id):
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    r_job = RecurringJob.query.join(Queue).filter(
        RecurringJob.id == r_id,
        Queue.project_id == project.id
    ).first()

    if not r_job:
        return jsonify({'success': False, 'message': 'Recurring job not found'}), 404

    try:
        r_job.is_active = not r_job.is_active
        if r_job.is_active:
            r_job.next_run_at = get_next_cron_time(r_job.cron_expression)
        db.session.commit()
        return jsonify({'success': True, 'recurring_job': r_job.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


# --- Job Querying & Monitoring ---
@jobs_bp.route('/', methods=['GET'])
@jwt_required()
def get_jobs():
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    # Filters
    queue_id = request.args.get('queue_id')
    status = request.args.get('status')
    batch_id = request.args.get('batch_id')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 20))

    query = Job.query.join(Queue).filter(Queue.project_id == project.id)

    if queue_id:
        query = query.filter(Job.queue_id == queue_id)
    if status:
        query = query.filter(Job.status == status)
    if batch_id:
        query = query.filter(Job.batch_id == batch_id)

    # Paginate
    pagination = query.order_by(Job.created_at.desc()).paginate(page=page, per_page=limit, error_out=False)
    
    return jsonify({
        'success': True,
        'jobs': [j.to_dict() for j in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    }), 200


@jobs_bp.route('/<job_id>', methods=['GET'])
@jwt_required()
def get_job_details(job_id):
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    job = Job.query.join(Queue).filter(Job.id == job_id, Queue.project_id == project.id).first()
    if not job:
        return jsonify({'success': False, 'message': 'Job not found'}), 404

    # Fetch executions (retry attempts) and logs
    executions_data = []
    for execution in job.executions:
        exec_dict = execution.to_dict()
        # Fetch logs associated with this attempt
        logs = JobLog.query.filter_by(execution_id=execution.id).order_by(JobLog.timestamp.asc()).all()
        exec_dict['logs'] = [l.to_dict() for l in logs]
        executions_data.append(exec_dict)

    job_data = job.to_dict()
    job_data['history'] = executions_data

    return jsonify({
        'success': True,
        'job': job_data
    }), 200


@jobs_bp.route('/<job_id>/retry', methods=['POST'])
@jwt_required()
def retry_failed_job(job_id):
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    job = Job.query.join(Queue).filter(Job.id == job_id, Queue.project_id == project.id).first()
    if not job:
        return jsonify({'success': False, 'message': 'Job not found'}), 404

    if job.status not in ['FAILED', 'FAILED_DLQ']:
        return jsonify({'success': False, 'message': 'Only failed or DLQ jobs can be retried'}), 400

    try:
        # Reset retry parameters and re-queue
        job.status = 'QUEUED'
        job.retry_count = 0
        job.last_error = None
        job.run_at = None
        job.worker_id = None
        job.updated_at = datetime.utcnow()
        
        # Remove from DLQ entries if exists
        dlq_entry = DeadLetterQueueEntry.query.filter_by(original_job_id=job.id).first()
        if dlq_entry:
            db.session.delete(dlq_entry)
        db.session.commit()
        try:
            from app.ws import broadcast_event
            broadcast_event('job_updated', job.to_dict())
        except Exception:
            pass
        return jsonify({
            'success': True, 
            'message': 'Job re-queued successfully', 
            'job': job.to_dict()
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Retry failed: {str(e)}'}), 500


@jobs_bp.route('/<job_id>', methods=['DELETE'])
@jwt_required()
def delete_job(job_id):
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    job = Job.query.join(Queue).filter(Job.id == job_id, Queue.project_id == project.id).first()
    if not job:
        return jsonify({'success': False, 'message': 'Job not found'}), 404

    try:
        # Delete from DLQ entries if exists
        from app.models import DeadLetterQueueEntry
        dlq_entry = DeadLetterQueueEntry.query.filter_by(original_job_id=job.id).first()
        if dlq_entry:
            db.session.delete(dlq_entry)
            
        db.session.delete(job)
        db.session.commit()
        
        try:
            from app.ws import broadcast_event
            broadcast_event('scheduler_update')
        except Exception:
            pass
            
        return jsonify({'success': True, 'message': 'Job deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Failed to delete job: {str(e)}'}), 500

