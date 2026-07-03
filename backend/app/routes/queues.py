from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.database import db
from app.models import User, Project, Queue, RetryPolicy, Job

queues_bp = Blueprint('queues', __name__)

def get_user_project(user_id, project_id=None):
    """Helper to verify user owns the project and return it."""
    user = User.query.get(user_id)
    if not user:
        return None
    
    if project_id:
        project = Project.query.filter_by(id=project_id, organization_id=user.organization_id).first()
    else:
        project = Project.query.filter_by(organization_id=user.organization_id).first()
        
    return project

@queues_bp.route('/project', methods=['PATCH'])
@jwt_required()
def update_project_name():
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    data = request.get_json() or {}
    name = data.get('name')
    if not name:
        return jsonify({'success': False, 'message': 'Project name is required'}), 400

    try:
        project.name = name
        db.session.commit()
        return jsonify({'success': True, 'project': project.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Failed to update project: {str(e)}'}), 500

# --- Retry Policies CRUD ---
@queues_bp.route('/retry-policies', methods=['GET'])
@jwt_required()
def get_retry_policies():
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    policies = RetryPolicy.query.filter_by(project_id=project.id).all()
    return jsonify({
        'success': True,
        'policies': [p.to_dict() for p in policies]
    }), 200


@queues_bp.route('/retry-policies', methods=['POST'])
@jwt_required()
def create_retry_policy():
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    data = request.get_json() or {}
    name = data.get('name')
    strategy = data.get('strategy', 'FIXED') # FIXED, LINEAR, EXPONENTIAL
    backoff_interval = data.get('backoff_interval', 5)
    max_retries = data.get('max_retries', 3)

    if not name or strategy not in ['FIXED', 'LINEAR', 'EXPONENTIAL']:
        return jsonify({'success': False, 'message': 'Invalid parameters'}), 400

    try:
        policy = RetryPolicy(
            name=name,
            strategy=strategy,
            backoff_interval=int(backoff_interval),
            max_retries=int(max_retries),
            project_id=project.id
        )
        db.session.add(policy)
        db.session.commit()
        return jsonify({'success': True, 'policy': policy.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Failed: {str(e)}'}), 500


# --- Queues CRUD ---
@queues_bp.route('/', methods=['GET'])
@jwt_required()
def get_queues():
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    queues = Queue.query.filter_by(project_id=project.id).order_by(Queue.priority.desc()).all()
    
    # Calculate simple real-time stats for dashboard
    queues_data = []
    for q in queues:
        q_dict = q.to_dict()
        
        # Count statuses
        stats = db.session.query(
            Job.status, db.func.count(Job.id)
        ).filter(Job.queue_id == q.id).group_by(Job.status).all()
        
        status_counts = {
            'QUEUED': 0, 'SCHEDULED': 0, 'CLAIMED': 0, 'RUNNING': 0, 
            'COMPLETED': 0, 'FAILED': 0, 'FAILED_DLQ': 0
        }
        for status, count in stats:
            if status in status_counts:
                status_counts[status] = count
                
        q_dict['stats'] = status_counts
        queues_data.append(q_dict)

    return jsonify({
        'success': True,
        'queues': queues_data
    }), 200


@queues_bp.route('/', methods=['POST'])
@jwt_required()
def create_queue():
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    data = request.get_json() or {}
    name = data.get('name')
    priority = data.get('priority', 1)
    max_concurrency = data.get('max_concurrency', 5)
    retry_policy_id = data.get('retry_policy_id')

    if not name:
        return jsonify({'success': False, 'message': 'Queue name is required'}), 400

    # Verify retry policy exists if provided
    if retry_policy_id:
        policy = RetryPolicy.query.filter_by(id=retry_policy_id, project_id=project.id).first()
        if not policy:
            return jsonify({'success': False, 'message': 'Invalid retry policy'}), 400

    try:
        queue = Queue(
            name=name,
            project_id=project.id,
            priority=int(priority),
            max_concurrency=int(max_concurrency),
            retry_policy_id=retry_policy_id
        )
        db.session.add(queue)
        db.session.commit()
        return jsonify({'success': True, 'queue': queue.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Failed: {str(e)}'}), 500


@queues_bp.route('/<queue_id>', methods=['PATCH'])
@jwt_required()
def update_queue(queue_id):
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    queue = Queue.query.filter_by(id=queue_id, project_id=project.id).first()
    if not queue:
        return jsonify({'success': False, 'message': 'Queue not found'}), 404

    data = request.get_json() or {}
    if 'priority' in data:
        queue.priority = int(data['priority'])
    if 'max_concurrency' in data:
        queue.max_concurrency = int(data['max_concurrency'])
    if 'is_paused' in data:
        queue.is_paused = bool(data['is_paused'])
    if 'retry_policy_id' in data:
        policy_id = data['retry_policy_id']
        if policy_id:
            policy = RetryPolicy.query.filter_by(id=policy_id, project_id=project.id).first()
            if not policy:
                return jsonify({'success': False, 'message': 'Invalid retry policy'}), 400
        queue.retry_policy_id = policy_id

    try:
        db.session.commit()
        return jsonify({'success': True, 'queue': queue.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Update failed: {str(e)}'}), 500


@queues_bp.route('/<queue_id>', methods=['DELETE'])
@jwt_required()
def delete_queue(queue_id):
    user_id = get_jwt_identity()
    project = get_user_project(user_id)
    if not project:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

    queue = Queue.query.filter_by(id=queue_id, project_id=project.id).first()
    if not queue:
        return jsonify({'success': False, 'message': 'Queue not found'}), 404

    try:
        db.session.delete(queue)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Queue deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Delete failed: {str(e)}'}), 500
