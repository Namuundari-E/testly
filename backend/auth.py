import firebase_admin
from firebase_admin import credentials, auth, firestore
from fastapi import HTTPException, Depends, Header
from typing import Optional
import os

# Initialize Firebase
def initialize_firebase():
    """Initialize Firebase Admin SDK"""
    cred_path = os.getenv('FIREBASE_CREDENTIALS', 'firebase-credentials.json')
    
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    
    return firestore.client()

# Get Firestore client
db = None

def get_db():
    global db
    if db is None:
        db = initialize_firebase()
    return db

# Verify Firebase token
async def verify_token(authorization: str = Header(None)) -> dict:
    """Verify Firebase ID token from Authorization header"""
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization header")
    
    try:
        # Extract token from "Bearer <token>"
        token = authorization.split("Bearer ")[-1]
        
        # Verify token with Firebase
        decoded_token = auth.verify_id_token(token)
        
        return decoded_token
    
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

# Get current user info
async def get_current_user(token_data: dict = Depends(verify_token)) -> dict:
    """Get current user information"""
    db = get_db()
    
    user_id = token_data['uid']
    user_email = token_data.get('email')
    
    # Get user document from Firestore
    user_doc = db.collection('users').document(user_id).get()
    
    if not user_doc.exists:
        # Create user document if doesn't exist
        user_data = {
            'email': user_email,
            'role': 'student',  # Default role
            'created_at': firestore.SERVER_TIMESTAMP
        }
        db.collection('users').document(user_id).set(user_data)
        user_data['uid'] = user_id
        return user_data
    
    user_data = user_doc.to_dict()
    user_data['uid'] = user_id
    return user_data

# Require teacher role
async def require_teacher(user: dict = Depends(get_current_user)) -> dict:
    """Ensure user is a teacher"""
    if user.get('role') != 'teacher':
        raise HTTPException(status_code=403, detail="Teacher access required")
    return user

# Require student role
async def require_student(user: dict = Depends(get_current_user)) -> dict:
    """Ensure user is a student"""
    if user.get('role') != 'student':
        raise HTTPException(status_code=403, detail="Student access required")
    return user