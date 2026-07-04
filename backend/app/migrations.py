from sqlalchemy import text, inspect
from app.database import db

def run_migrations(app):
    """
    Checks if idempotency_key columns exist in 'jobs' and 'job_executions' tables,
    and runs alter queries to add them if they are missing (handles both SQLite and PostgreSQL).
    """
    with app.app_context():
        try:
            inspector = inspect(db.engine)
            
            # 1. Update 'jobs' table
            if 'jobs' in inspector.get_table_names():
                columns_jobs = [col['name'] for col in inspector.get_columns('jobs')]
                if 'idempotency_key' not in columns_jobs:
                    print("Migration: Adding idempotency_key column to jobs table...")
                    # Add column
                    db.session.execute(text("ALTER TABLE jobs ADD COLUMN idempotency_key VARCHAR(100)"))
                    db.session.commit()
                    
                    # Create index/unique constraint
                    try:
                        db.session.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_idempotency_key ON jobs(idempotency_key)"))
                        db.session.commit()
                    except Exception as e:
                        db.session.rollback()
                        print(f"Migration warning: Could not create unique index on jobs: {e}")
            
            # 2. Update 'job_executions' table
            if 'job_executions' in inspector.get_table_names():
                columns_exec = [col['name'] for col in inspector.get_columns('job_executions')]
                if 'idempotency_key' not in columns_exec:
                    print("Migration: Adding idempotency_key column to job_executions table...")
                    # Add column
                    db.session.execute(text("ALTER TABLE job_executions ADD COLUMN idempotency_key VARCHAR(100)"))
                    db.session.commit()
                    
                    # Create index
                    try:
                        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_job_executions_idempotency_key ON job_executions(idempotency_key)"))
                        db.session.commit()
                    except Exception as e:
                        db.session.rollback()
                        print(f"Migration warning: Could not create index on job_executions: {e}")
                        
            print("Database schema migration checks complete.")
        except Exception as e:
            print(f"Database migration failed: {e}")
            db.session.rollback()
