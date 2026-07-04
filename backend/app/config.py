import os
from datetime import timedelta
from dotenv import load_dotenv

# Load environment variables from .env file if it exists
load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'default-dev-secret-key-change-in-prod')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'default-jwt-secret-key-change-in-prod')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    
    # Database URL configuration
    # Fallback to local SQLite for fallback, but main target is PostgreSQL
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'sqlite:///jobsphere.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Worker configuration
    WORKER_NAME = os.environ.get('WORKER_NAME', 'dev-worker-1')
    MAX_WORKER_CONCURRENCY = int(os.environ.get('MAX_WORKER_CONCURRENCY', '10'))
    POLL_INTERVAL = float(os.environ.get('POLL_INTERVAL', '1.0'))
    HEARTBEAT_INTERVAL = float(os.environ.get('HEARTBEAT_INTERVAL', '5.0'))
    MAX_RETRY_DELAY_CAP = int(os.environ.get('MAX_RETRY_DELAY_CAP', '3600'))
    RATE_LIMIT_BUCKET_CAPACITY = int(os.environ.get('RATE_LIMIT_BUCKET_CAPACITY', '60'))
    RATE_LIMIT_REFILL_RATE = float(os.environ.get('RATE_LIMIT_REFILL_RATE', '1.0'))
