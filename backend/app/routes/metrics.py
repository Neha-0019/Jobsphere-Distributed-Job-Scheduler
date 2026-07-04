from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta
from app.database import db
from app.models import User, Project, Queue, Job, Worker, JobExecution, QueueDepthSnapshot

metrics_bp = Blueprint('metrics', __name__)

def get_user_project(user_id):
    user = User.query.get(user_id)
    if not user:
        return None
    return Project.query.filter_by(organization_id=user.organization_id).first()


@metrics_bp.route('/overview', methods=['GET'])
@jwt_required()
def get_overview_stats():
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    # Count jobs across all queues in the project by status
    stats = db.session.query(
        Job.status, db.func.count(Job.id)
    ).join(Queue).filter(Queue.project_id == project.id).group_by(Job.status).all()

    status_counts = {
        'QUEUED': 0, 'SCHEDULED': 0, 'CLAIMED': 0, 'RUNNING': 0, 
        'COMPLETED': 0, 'FAILED': 0, 'FAILED_DLQ': 0
    }
    total_jobs = 0
    for status, count in stats:
        if status in status_counts:
            status_counts[status] = count
            total_jobs += count

    # Count active workers (heartbeat within 15 seconds)
    heartbeat_limit = datetime.utcnow() - timedelta(seconds=15)
    active_workers_count = Worker.query.filter(
        Worker.status == 'ACTIVE',
        Worker.last_heartbeat >= heartbeat_limit
    ).count()

    active_workers = Worker.query.filter(Worker.last_heartbeat >= heartbeat_limit).all()

    # Calculate average job execution time in milliseconds
    avg_duration = db.session.query(db.func.avg(JobExecution.duration_ms)).select_from(JobExecution)\
        .join(Job).join(Queue).filter(Queue.project_id == project.id, JobExecution.status == 'COMPLETED').scalar()

    # Success rate
    completed_count = status_counts['COMPLETED']
    failed_total = status_counts['FAILED'] + status_counts['FAILED_DLQ']
    success_rate = 100.0
    if (completed_count + failed_total) > 0:
        success_rate = round((completed_count / (completed_count + failed_total)) * 100, 2)

    return jsonify({
        'success': True,
        'stats': {
            'status_counts': status_counts,
            'total_jobs': total_jobs,
            'active_workers': active_workers_count,
            'avg_execution_time_ms': round(avg_duration or 0, 2),
            'success_rate_percent': success_rate
        },
        'workers': [w.to_dict() for w in active_workers]
    }), 200


@metrics_bp.route('/throughput', methods=['GET'])
@jwt_required()
def get_throughput_chart_data():
    """
    Returns time-series throughput metrics of completed vs failed jobs 
    in 5-minute intervals for the last 60 minutes.
    """
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    now = datetime.utcnow()
    one_hour_ago = now - timedelta(hours=1)
    
    # Query finished executions in last hour
    executions = db.session.query(
        JobExecution.status,
        JobExecution.finished_at
    ).join(Job).join(Queue).filter(
        Queue.project_id == project.id,
        JobExecution.status.in_(['COMPLETED', 'FAILED']),
        JobExecution.finished_at >= one_hour_ago
    ).all()

    # Group into 12 buckets of 5 minutes
    buckets = {}
    for i in range(12):
        bucket_time = one_hour_ago + timedelta(minutes=i*5)
        label = bucket_time.isoformat() + 'Z'
        buckets[label] = {'time': label, 'completed': 0, 'failed': 0}

    for status, finished_at in executions:
        if not finished_at:
            continue
        # Find which 5-minute bucket this fits in
        minutes_diff = int((finished_at - one_hour_ago).total_seconds() / 60)
        bucket_index = min(11, max(0, int(minutes_diff / 5)))
        bucket_time = one_hour_ago + timedelta(minutes=bucket_index*5)
        label = bucket_time.isoformat() + 'Z'
        
        if status == 'COMPLETED':
            buckets[label]['completed'] += 1
        elif status == 'FAILED':
            buckets[label]['failed'] += 1

    chart_data = list(buckets.values())
    
    return jsonify({
        'success': True,
        'data': chart_data
    }), 200

@metrics_bp.route('/latency', methods=['GET'])
@jwt_required()
def get_latency_percentiles():
    """
    Computes and returns the P50, P95, and P99 job execution latencies
    from completed job execution records.
    """
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    # Fetch duration of all completed executions in this project
    durations = [
        d[0] for d in db.session.query(JobExecution.duration_ms)
        .join(Job).join(Queue)
        .filter(
            Queue.project_id == project.id,
            JobExecution.status == 'COMPLETED',
            JobExecution.duration_ms.isnot(None)
        )
        .order_by(JobExecution.duration_ms.asc()).all()
    ]

    n = len(durations)
    if n == 0:
        return jsonify({
            'success': True,
            'p50': 0.0,
            'p95': 0.0,
            'p99': 0.0,
            'count': 0
        }), 200

    def get_percentile(p):
        idx = int(n * p)
        if idx >= n:
            idx = n - 1
        return float(durations[idx])

    return jsonify({
        'success': True,
        'p50': get_percentile(0.50),
        'p95': get_percentile(0.95),
        'p99': get_percentile(0.99),
        'count': n
    }), 200

@metrics_bp.route('/queue-depth', methods=['GET'])
@jwt_required()
def get_queue_depth_over_time():
    """
    Returns time-series queue depth metrics (sampled count of QUEUED jobs)
    for active queues in the project, looking back 6 hours.
    """
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    now = datetime.utcnow()
    six_hours_ago = now - timedelta(hours=6)

    snapshots = db.session.query(
        Queue.name,
        QueueDepthSnapshot.depth,
        QueueDepthSnapshot.timestamp
    ).join(Queue).filter(
        Queue.project_id == project.id,
        QueueDepthSnapshot.timestamp >= six_hours_ago
    ).order_by(QueueDepthSnapshot.timestamp.asc()).all()

    data = []
    for queue_name, depth, timestamp in snapshots:
        data.append({
            'queue_name': queue_name,
            'depth': depth,
            'timestamp': timestamp.isoformat() + 'Z'
        })

    return jsonify({
        'success': True,
        'data': data
    }), 200
