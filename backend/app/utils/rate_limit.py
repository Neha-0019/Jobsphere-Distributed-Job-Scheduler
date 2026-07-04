import time
from threading import Lock
from functools import wraps
from flask import jsonify, current_app
from flask_jwt_extended import get_jwt_identity
from app.models import User, Project

# ==============================================================================
# KNOWN LIMITATION & SCOPE BOUNDARY:
# This rate limiter is in-memory and single-process scoped.
# If the application is scaled horizontally (multi-instance deployment behind a
# load balancer), each process enforces its own independent token bucket limit.
# The effective rate limit across the cluster will scale as:
# (configured_limit * number_of_processes).
#
# For true distributed exactly-once enforcement, this implementation must be
# refactored to use a centralized cache store like Redis (using Redis INCR/TTL
# or a Redis-backed token bucket algorithm).
# ==============================================================================

# Global in-memory thread-safe storage for token buckets
# project_id -> { "tokens": float, "last_refilled_at": float }
_buckets = {}
_lock = Lock()

def rate_limit_project():
    """
    Decorator that applies token-bucket rate limiting per project API key/workspace.
    Requires flask-jwt-extended user authentication context to resolve the active project.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user_id = get_jwt_identity()
            if not user_id:
                # If there's no JWT identity, skip rate limiting (unauthenticated routes)
                return f(*args, **kwargs)

            # Resolve project context
            user = User.query.get(user_id)
            if not user:
                return jsonify({'success': False, 'message': 'User not found'}), 404
            
            project = Project.query.filter_by(organization_id=user.organization_id).first()
            if not project:
                return jsonify({'success': False, 'message': 'Project context not found'}), 404

            project_id = project.id

            # Extract limits from config
            capacity = current_app.config.get('RATE_LIMIT_BUCKET_CAPACITY', 60)
            refill_rate = current_app.config.get('RATE_LIMIT_REFILL_RATE', 1.0) # tokens per second

            now = time.time()

            with _lock:
                bucket = _buckets.get(project_id)
                if bucket is None:
                    # Initialize token bucket at maximum capacity
                    bucket = {
                        "tokens": float(capacity),
                        "last_refilled_at": now
                    }
                    _buckets[project_id] = bucket
                else:
                    # Refill bucket according to time delta
                    elapsed = now - bucket["last_refilled_at"]
                    refill_amount = elapsed * refill_rate
                    bucket["tokens"] = min(float(capacity), bucket["tokens"] + refill_amount)
                    bucket["last_refilled_at"] = now

                # Verify if at least one token is available
                if bucket["tokens"] < 1.0:
                    return jsonify({
                        'success': False,
                        'message': 'Rate limit exceeded. Please try again later.'
                    }), 429

                # Consume a token
                bucket["tokens"] -= 1.0

            return f(*args, **kwargs)
        return decorated_function
    return decorator
