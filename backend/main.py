from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List,Dict,Optional
import torch
from transformers import TrOCRProcessor, VisionEncoderDecoderModel
from PIL import Image
import io
import cv2
import numpy as np
import os

#import ur omr detection
from auth import get_current_user, require_teacher, require_student, get_db, initialize_firebase
from omr_detection import OMRDetector
from check_test import process_omr, process_ocr, compare_answers_with_llms , check_test
from check_test import TestResult

app = FastAPI(title="Document OCR Service")

#Cors middleware for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#Global model variable
ocr_processor = None
ocr_model = None
omr_detector = None

@app.on_event("startup")
async def load_models():
    global ocr_processor, ocr_model, omr_detector
    ocr_processor = TrOCRProcessor.from_pretrained("kazars24/trocr-base-handwritten-ru")
    ocr_model = VisionEncoderDecoderModel.from_pretrained("kazars24/trocr-base-handwritten-ru")
    
    ocr_model.to("cuda" if torch.cuda.is_available() else "cpu")
    
    ocr_model.eval()
    
    #omr
    print("Loading OMR Detector...")
    omr_detector = OMRDetector(bubble_threshold=0.45, min_bubble_area=500)
    print("OMR Detector loaded.")

@app.get("/")
async def root():
    return {"message": "Document OCR Service is running.", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy",
            "gpu_availbale": torch.cuda.is_available(),
            "model_loaded": ocr_model is not None,
            "omr_model_loaded": omr_detector is not None}
        


def detect_omr_bubbles(image: np.ndarray, config: Dict) -> List[Dict]:
    """Detect OMR bubbles in the image based on the provided configuration."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    
    # Find contours (bubbles)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # This is a simplified example
    # In production, you'd need precise bubble detection based on your template
    results = {}
    return results

def extract_answer_regions(image: Image.Image, question_config: List[Dict]) -> List[Image.Image]:
    """Extract answer regions from the image based on the provided configuration."""
    regions = []
    
    for config in question_config:
        if 'bbox' in config:  # bounding box [x, y, width, height]
            bbox = config['bbox']
            region = image.crop((bbox[0], bbox[1], bbox[0]+bbox[2], bbox[1]+bbox[3]))
            regions.append(region)
    return regions

@app.post("/check_test", response_model=TestResult)
async def check_test(
    test_image: UploadFile = File(...),
    test_config: str = File(...) #json string of testconfig
):
    result = await check_test(test_image, test_config)
    return result
    
@app.post("/ocr_test")
async def test_ocr(image: UploadFile = File(...)):
    result = await process_ocr(image)
    return {"result:": result}

@app.post("/omr-test")
async def test_omr(
    image: UploadFile = File(...),
    num_questions: int = 5,
    options_per_question: int = 4
):
    result = await process_omr(
        image,
        num_questions,
        options_per_question
    )
    return {"result:": result}
    
    # ==================== TEACHER ENDPOINTS ====================

@app.post("/api/exams/create")
async def create_exam(exam: ExamCreate, user: dict = Depends(require_teacher)):
    """Teacher creates a new exam"""
    db = get_db()
    
    # Generate unique exam code
    exam_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    
    exam_data = {
        'title': exam.title,
        'description': exam.description,
        'duration_minutes': exam.duration_minutes,
        'questions': [q.dict() for q in exam.questions],
        'omr_config': exam.omr_config or {},
        'exam_code': exam_code,
        'teacher_id': user['uid'],
        'teacher_email': user['email'],
        'created_at': datetime.utcnow().isoformat(),
        'is_active': True,
        'total_points': sum(q.points for q in exam.questions)
    }
    
    # Save to Firestore
    exam_ref = db.collection('exams').document()
    exam_ref.set(exam_data)
    
    return {
        "exam_id": exam_ref.id,
        "exam_code": exam_code,
        "message": "Exam created successfully"
    }

@app.get("/api/exams/my-exams")
async def get_my_exams(user: dict = Depends(require_teacher)):
    """Get all exams created by teacher"""
    db = get_db()
    
    exams = db.collection('exams').where('teacher_id', '==', user['uid']).stream()
    
    exam_list = []
    for exam in exams:
        exam_data = exam.to_dict()
        exam_data['exam_id'] = exam.id
        exam_list.append(exam_data)
    
    return {"exams": exam_list}

@app.get("/api/exams/{exam_id}")
async def get_exam(exam_id: str, user: dict = Depends(require_teacher)):
    """Get exam details"""
    db = get_db()
    
    exam_doc = db.collection('exams').document(exam_id).get()
    
    if not exam_doc.exists:
        raise HTTPException(status_code=404, detail="Exam not found")
    
    exam_data = exam_doc.to_dict()
    
    # Check if user owns this exam
    if exam_data['teacher_id'] != user['uid']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    exam_data['exam_id'] = exam_id
    return exam_data

@app.put("/api/exams/{exam_id}")
async def update_exam(exam_id: str, exam: ExamUpdate, user: dict = Depends(require_teacher)):
    """Update exam"""
    db = get_db()
    
    exam_ref = db.collection('exams').document(exam_id)
    exam_doc = exam_ref.get()
    
    if not exam_doc.exists:
        raise HTTPException(status_code=404, detail="Exam not found")
    
    exam_data = exam_doc.to_dict()
    
    if exam_data['teacher_id'] != user['uid']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Update fields
    update_data = exam.dict(exclude_none=True)
    if 'questions' in update_data:
        update_data['questions'] = [q.dict() for q in exam.questions]
        update_data['total_points'] = sum(q.points for q in exam.questions)
    
    exam_ref.update(update_data)
    
    return {"message": "Exam updated successfully"}

@app.get("/api/exams/{exam_id}/submissions")
async def get_exam_submissions(exam_id: str, user: dict = Depends(require_teacher)):
    """Get all submissions for an exam"""
    db = get_db()
    
    # Verify exam ownership
    exam_doc = db.collection('exams').document(exam_id).get()
    if not exam_doc.exists:
        raise HTTPException(status_code=404, detail="Exam not found")
    
    exam_data = exam_doc.to_dict()
    if exam_data['teacher_id'] != user['uid']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get submissions
    submissions = db.collection('submissions').where('exam_id', '==', exam_id).stream()
    
    submission_list = []
    for sub in submissions:
        sub_data = sub.to_dict()
        sub_data['submission_id'] = sub.id
        submission_list.append(sub_data)
    
    return {"submissions": submission_list}

# ==================== STUDENT ENDPOINTS ====================

@app.post("/api/exams/join")
async def join_exam(exam_code: str, user: dict = Depends(require_student)):
    """Student joins exam with code"""
    db = get_db()
    
    # Find exam by code
    exams = db.collection('exams').where('exam_code', '==', exam_code).limit(1).stream()
    
    exam_doc = None
    for e in exams:
        exam_doc = e
        break
    
    if not exam_doc:
        raise HTTPException(status_code=404, detail="Invalid exam code")
    
    exam_data = exam_doc.to_dict()
    
    if not exam_data.get('is_active'):
        raise HTTPException(status_code=400, detail="Exam is not active")
    
    # Return exam info (without answers)
    return {
        "exam_id": exam_doc.id,
        "title": exam_data['title'],
        "description": exam_data['description'],
        "duration_minutes": exam_data['duration_minutes'],
        "total_points": exam_data['total_points'],
        "questions": [
            {
                "question_id": q['question_id'],
                "question_text": q['question_text'],
                "type": q['type'],
                "options": q.get('options'),
                "points": q['points']
            }
            for q in exam_data['questions']
        ]
    }

@app.post("/api/exams/submit")
async def submit_exam(
    exam_id: str,
    test_image: UploadFile = File(...),
    user: dict = Depends(require_student)
):
    """Student submits exam paper"""
    db = get_db()
    
    # Get exam
    exam_doc = db.collection('exams').document(exam_id).get()
    if not exam_doc.exists:
        raise HTTPException(status_code=404, detail="Exam not found")
    
    exam_data = exam_doc.to_dict()
    
    # Check if already submitted
    existing = db.collection('submissions')\
        .where('exam_id', '==', exam_id)\
        .where('student_id', '==', user['uid'])\
        .limit(1).stream()
    
    if any(existing):
        raise HTTPException(status_code=400, detail="Already submitted this exam")
    
    # Process image
    image_bytes = await test_image.read()
    image = Image.open(io.BytesIO(image_bytes))
    image_np = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    
    # Grade exam
    results = []
    total_score = 0.0
    max_score = exam_data['total_points']
    
    mcq_questions = [q for q in exam_data['questions'] if q['type'] == 'mcq']
    
    if mcq_questions and omr_detector:
        try:
            omr_config = exam_data.get('omr_config', {})
            omr_results = omr_detector.detect_grid_answers(
                image_np,
                num_questions=len(mcq_questions),
                options_per_question=omr_config.get('options_per_question', 4),
                grid_config=omr_config.get('grid_region')
            )
            
            for question in mcq_questions:
                student_answer = omr_results.get(question['question_id'], 'BLANK')
                is_correct = student_answer == question['correct_answer']
                score = question['points'] if is_correct else 0.0
                
                results.append({
                    'question_id': question['question_id'],
                    'type': 'mcq',
                    'student_answer': student_answer,
                    'correct_answer': question['correct_answer'],
                    'score': score,
                    'max_points': question['points']
                })
                
                total_score += score
        
        except Exception as e:
            print(f"OMR error: {e}")
    
    # Save submission
    submission_data = {
        'exam_id': exam_id,
        'student_id': user['uid'],
        'student_email': user['email'],
        'submitted_at': datetime.utcnow().isoformat(),
        'total_score': total_score,
        'max_score': max_score,
        'percentage': (total_score / max_score * 100) if max_score > 0 else 0,
        'results': results
    }
    
    submission_ref = db.collection('submissions').document()
    submission_ref.set(submission_data)
    
    return {
        "submission_id": submission_ref.id,
        "total_score": total_score,
        "max_score": max_score,
        "percentage": submission_data['percentage'],
        "results": results
    }

@app.get("/api/exams/my-submissions")
async def get_my_submissions(user: dict = Depends(require_student)):
    """Get student's submissions"""
    db = get_db()
    
    submissions = db.collection('submissions').where('student_id', '==', user['uid']).stream()
    
    submission_list = []
    for sub in submissions:
        sub_data = sub.to_dict()
        sub_data['submission_id'] = sub.id
        
        # Get exam title
        exam_doc = db.collection('exams').document(sub_data['exam_id']).get()
        if exam_doc.exists:
            sub_data['exam_title'] = exam_doc.to_dict().get('title')
        
        submission_list.append(sub_data)
    
    return {"submissions": submission_list}

# ==================== UTILITY ENDPOINTS ====================

@app.post("/api/users/set-role")
async def set_user_role(email: str, role: str, user: dict = Depends(get_current_user)):
    """Set user role (admin only - for now, first user can set roles)"""
    db = get_db()
    
    if role not in ['teacher', 'student']:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    # Find user by email
    users = db.collection('users').where('email', '==', email).limit(1).stream()
    
    user_doc = None
    for u in users:
        user_doc = u
        break
    
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    db.collection('users').document(user_doc.id).update({'role': role})
    
    return {"message": f"User role updated to {role}"}
    
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)