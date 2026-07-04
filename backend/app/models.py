import uuid
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from app.database import db

# Relationship tables / models
class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    organization_id = db.Column(db.String(36), db.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    organization = db.relationship('Organization', back_populates='users')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'organization_id': self.organization_id,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None
        }


class Organization(db.Model):
    __tablename__ = 'organizations'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    users = db.relationship('User', back_populates='organization', cascade='all, delete-orphan')
    projects = db.relationship('Project', back_populates='organization', cascade='all, delete-orphan')


class Project(db.Model):
    __tablename__ = 'projects'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(100), nullable=False)
    api_key = db.Column(db.String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()), index=True)
    organization_id = db.Column(db.String(36), db.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    organization = db.relationship('Organization', back_populates='projects')
    queues = db.relationship('Queue', back_populates='project', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'api_key': self.api_key,
            'organization_id': self.organization_id,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None
        }


class RetryPolicy(db.Model):
    __tablename__ = 'retry_policies'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(100), nullable=False)
    strategy = db.Column(db.String(20), nullable=False) # FIXED, LINEAR, EXPONENTIAL
    backoff_interval = db.Column(db.Integer, nullable=False, default=5) # in seconds
    max_retries = db.Column(db.Integer, nullable=False, default=3)
    project_id = db.Column(db.String(36), db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    queues = db.relationship('Queue', back_populates='retry_policy')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'strategy': self.strategy,
            'backoff_interval': self.backoff_interval,
            'max_retries': self.max_retries,
            'project_id': self.project_id
        }


class Queue(db.Model):
    __tablename__ = 'queues'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(100), nullable=False)
    project_id = db.Column(db.String(36), db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    priority = db.Column(db.Integer, nullable=False, default=1) # 1 (Low) to 10 (High)
    max_concurrency = db.Column(db.Integer, nullable=False, default=5)
    is_paused = db.Column(db.Boolean, nullable=False, default=False)
    retry_policy_id = db.Column(db.String(36), db.ForeignKey('retry_policies.id', ondelete='SET NULL'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = db.relationship('Project', back_populates='queues')
    retry_policy = db.relationship('RetryPolicy', back_populates='queues')
    jobs = db.relationship('Job', back_populates='queue', cascade='all, delete-orphan')
    recurring_jobs = db.relationship('RecurringJob', back_populates='queue', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'project_id': self.project_id,
            'priority': self.priority,
            'max_concurrency': self.max_concurrency,
            'is_paused': self.is_paused,
            'retry_policy_id': self.retry_policy_id,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
            'updated_at': self.updated_at.isoformat() + 'Z' if self.updated_at else None
        }


job_dependencies = db.Table('job_dependencies',
    db.Column('parent_job_id', db.String(36), db.ForeignKey('jobs.id', ondelete='CASCADE'), primary_key=True),
    db.Column('child_job_id', db.String(36), db.ForeignKey('jobs.id', ondelete='CASCADE'), primary_key=True)
)


class Job(db.Model):
    __tablename__ = 'jobs'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    queue_id = db.Column(db.String(36), db.ForeignKey('queues.id', ondelete='CASCADE'), nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default='QUEUED', index=True) # QUEUED, SCHEDULED, CLAIMED, RUNNING, COMPLETED, FAILED, FAILED_DLQ, BLOCKED, FAILED_DEPENDENCY
    payload = db.Column(db.Text, nullable=False) # JSON payload string
    priority = db.Column(db.Integer, nullable=False, default=1, index=True) # Higher runs first
    run_at = db.Column(db.DateTime, nullable=True, index=True) # For delayed / scheduled execution
    retry_count = db.Column(db.Integer, nullable=False, default=0)
    max_retries = db.Column(db.Integer, nullable=False, default=3)
    last_error = db.Column(db.Text, nullable=True)
    worker_id = db.Column(db.String(50), db.ForeignKey('workers.id', ondelete='SET NULL'), nullable=True, index=True)
    batch_id = db.Column(db.String(36), nullable=True, index=True) # For batch groupings
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)
    idempotency_key = db.Column(db.String(100), unique=True, nullable=True, index=True)

    # Relationships
    queue = db.relationship('Queue', back_populates='jobs')
    worker = db.relationship('Worker', back_populates='jobs')
    executions = db.relationship('JobExecution', back_populates='job', cascade='all, delete-orphan')

    # Self-referential DAG parent jobs
    parents = db.relationship(
        'Job',
        secondary=job_dependencies,
        primaryjoin=(job_dependencies.c.child_job_id == id),
        secondaryjoin=(job_dependencies.c.parent_job_id == id),
        backref=db.backref('children', lazy='dynamic'),
        lazy='joined'
    )

    def to_dict(self):
        return {
            'id': self.id,
            'queue_id': self.queue_id,
            'queue_name': self.queue.name if self.queue else None,
            'status': self.status,
            'payload': self.payload,
            'priority': self.priority,
            'run_at': self.run_at.isoformat() + 'Z' if self.run_at else None,
            'retry_count': self.retry_count,
            'max_retries': self.max_retries,
            'last_error': self.last_error,
            'worker_id': self.worker_id,
            'batch_id': self.batch_id,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
            'updated_at': self.updated_at.isoformat() + 'Z' if self.updated_at else None,
            'completed_at': self.completed_at.isoformat() + 'Z' if self.completed_at else None,
            'idempotency_key': self.idempotency_key,
            'depends_on': [p.id for p in self.parents],
            'triggered_jobs': [c.id for c in self.children]
        }


class RecurringJob(db.Model):
    __tablename__ = 'recurring_jobs'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(100), nullable=False)
    queue_id = db.Column(db.String(36), db.ForeignKey('queues.id', ondelete='CASCADE'), nullable=False, index=True)
    cron_expression = db.Column(db.String(100), nullable=False) # e.g. "*/5 * * * *"
    payload = db.Column(db.Text, nullable=False) # JSON payload string
    priority = db.Column(db.Integer, nullable=False, default=1)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    next_run_at = db.Column(db.DateTime, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    queue = db.relationship('Queue', back_populates='recurring_jobs')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'queue_id': self.queue_id,
            'cron_expression': self.cron_expression,
            'payload': self.payload,
            'priority': self.priority,
            'is_active': self.is_active,
            'next_run_at': self.next_run_at.isoformat() + 'Z' if self.next_run_at else None,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None
        }


class Worker(db.Model):
    __tablename__ = 'workers'

    id = db.Column(db.String(50), primary_key=True) # Identifier (usually hostname/pid)
    name = db.Column(db.String(100), nullable=False)
    host = db.Column(db.String(100), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='ACTIVE', index=True) # ACTIVE, INACTIVE
    last_heartbeat = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    jobs = db.relationship('Job', back_populates='worker')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'host': self.host,
            'status': self.status,
            'last_heartbeat': self.last_heartbeat.isoformat() + 'Z' if self.last_heartbeat else None,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None
        }


class JobExecution(db.Model):
    __tablename__ = 'job_executions'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = db.Column(db.String(36), db.ForeignKey('jobs.id', ondelete='CASCADE'), nullable=False, index=True)
    worker_id = db.Column(db.String(50), nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, index=True) # RUNNING, COMPLETED, FAILED
    error_message = db.Column(db.Text, nullable=True)
    duration_ms = db.Column(db.Integer, nullable=True)
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    finished_at = db.Column(db.DateTime, nullable=True)
    idempotency_key = db.Column(db.String(100), nullable=True, index=True)

    # Relationships
    job = db.relationship('Job', back_populates='executions')
    logs = db.relationship('JobLog', back_populates='execution', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'job_id': self.job_id,
            'worker_id': self.worker_id,
            'status': self.status,
            'error_message': self.error_message,
            'duration_ms': self.duration_ms,
            'started_at': self.started_at.isoformat() + 'Z' if self.started_at else None,
            'finished_at': self.finished_at.isoformat() + 'Z' if self.finished_at else None,
            'idempotency_key': self.idempotency_key
        }


class JobLog(db.Model):
    __tablename__ = 'job_logs'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    execution_id = db.Column(db.String(36), db.ForeignKey('job_executions.id', ondelete='CASCADE'), nullable=False, index=True)
    log_level = db.Column(db.String(10), nullable=False, default='INFO') # INFO, WARNING, ERROR
    message = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    # Relationships
    execution = db.relationship('JobExecution', back_populates='logs')

    def to_dict(self):
        return {
            'id': self.id,
            'execution_id': self.execution_id,
            'log_level': self.log_level,
            'message': self.message,
            'timestamp': self.timestamp.isoformat() + 'Z' if self.timestamp else None
        }


class DeadLetterQueueEntry(db.Model):
    __tablename__ = 'dead_letter_queue'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    original_job_id = db.Column(db.String(36), nullable=False, index=True)
    queue_id = db.Column(db.String(36), nullable=False, index=True)
    payload = db.Column(db.Text, nullable=False)
    last_error = db.Column(db.Text, nullable=True)
    failed_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            'id': self.id,
            'original_job_id': self.original_job_id,
            'queue_id': self.queue_id,
            'payload': self.payload,
            'last_error': self.last_error,
            'failed_at': self.failed_at.isoformat() + 'Z' if self.failed_at else None
        }

class QueueDepthSnapshot(db.Model):
    __tablename__ = 'queue_depth_snapshots'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    queue_id = db.Column(db.String(36), db.ForeignKey('queues.id', ondelete='CASCADE'), nullable=False, index=True)
    depth = db.Column(db.Integer, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    # Relationships
    queue = db.relationship('Queue')

    def to_dict(self):
        return {
            'id': self.id,
            'queue_id': self.queue_id,
            'queue_name': self.queue.name if self.queue else None,
            'depth': self.depth,
            'timestamp': self.timestamp.isoformat() + 'Z' if self.timestamp else None
        }
