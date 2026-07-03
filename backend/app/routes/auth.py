from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
from app.database import db
from app.models import User, Organization, Project

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')
    org_name = data.get('organization_name', 'My Organization')
    project_name = data.get('project_name', 'Default Project')

    if not email or not password:
        return jsonify({'success': False, 'message': 'Email and password are required'}), 400

    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        return jsonify({'success': False, 'message': 'Email already registered'}), 400

    try:
        # Create organization
        org = Organization(name=org_name)
        db.session.add(org)
        db.session.flush() # populate org.id

        # Create project
        project = Project(name=project_name, organization_id=org.id)
        db.session.add(project)

        # Create user
        user = User(email=email, organization_id=org.id)
        user.set_password(password)
        db.session.add(user)

        db.session.commit()

        # Generate JWT token
        token = create_access_token(identity=user.id)

        return jsonify({
            'success': True,
            'message': 'User registered successfully',
            'token': token,
            'user': user.to_dict(),
            'project': project.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Registration failed: {str(e)}'}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'success': False, 'message': 'Email and password are required'}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({'success': False, 'message': 'Invalid email or password'}), 401

    # Find the user's project
    project = Project.query.filter_by(organization_id=user.organization_id).first()
    token = create_access_token(identity=user.id)

    return jsonify({
        'success': True,
        'message': 'Login successful',
        'token': token,
        'user': user.to_dict(),
        'project': project.to_dict() if project else None
    }), 200
