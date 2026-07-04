import os
from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from app.database import db
from app.config import Config

# Import blueprints
from app.routes.auth import auth_bp
from app.routes.queues import queues_bp
from app.routes.jobs import jobs_bp
from app.routes.metrics import metrics_bp

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Initialize extensions
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    db.init_app(app)
    
    # Initialize WebSockets
    from app.ws import init_ws
    init_ws(app)
    
    jwt = JWTManager(app)

    # Register Blueprints
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(queues_bp, url_prefix='/api/queues')
    app.register_blueprint(jobs_bp, url_prefix='/api/jobs')
    app.register_blueprint(metrics_bp, url_prefix='/api/metrics')

    # Global health check endpoint
    @app.route('/health', methods=['GET'])
    def health():
        return {'status': 'healthy', 'worker_support': True}, 200

    # Create tables if they do not exist
    with app.app_context():
        try:
            db.create_all()
            print("Database tables initialized successfully.")
            # Run dynamic column addition checks
            from app.migrations import run_migrations
            run_migrations(app)
        except Exception as e:
            print(f"Error initializing database tables: {e}")

    return app
