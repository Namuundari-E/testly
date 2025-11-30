# routes/submission_routes.py - FINAL VERSION with Image Resize & Crop

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import FileResponse
from datetime import datetime
import cv2
import numpy as np
from PIL import Image
import io
import os
import shutil

from auth import get_current_user, require_teacher, require_student, get_db
from check_test import process_omr, perform_ocr, compare_answers_with_gpt

router = APIRouter()

# Image processing config
TARGET_WIDTH = 1275
TARGET_HEIGHT = 1650
UPLOAD_DIR = "uploads/submissions"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/api/exams/submit")
async def submit_exam(
    exam_code: str = Form(...),
    test_image: UploadFile = File(...),
    user: dict = Depends(require_student)
):
    """Student submits exam - save locally"""
    db = get_db()
    
    print(f"\n=== STUDENT SUBMISSION ===")
    print(f"Exam code: {exam_code}")
    print(f"Student: {user['email']}")
    
    # Find exam
    exams = db.collection('exams').where('exam_code', '==', exam_code).limit(1).stream()
    exam_doc = None
    for e in exams:
        exam_doc = e
        break
    
    if not exam_doc:
        raise HTTPException(status_code=404, detail="Invalid exam code")
    
    exam_data = exam_doc.to_dict()
    exam_id = exam_doc.id
    
    if not exam_data.get('is_active'):
        raise HTTPException(status_code=400, detail="Exam is not active")
    
    # Check if already submitted
    existing = db.collection('submissions')\
        .where('exam_code', '==', exam_code)\
        .where('student_id', '==', user['uid'])\
        .limit(1).stream()
    
    if any(existing):
        raise HTTPException(status_code=400, detail="Already submitted this exam")
    
    # Save image locally
    try:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{exam_code}_{user['uid']}_{timestamp}.jpg"
        filepath = os.path.join(UPLOAD_DIR, filename)
        
        # Save file
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(test_image.file, buffer)
        
        print(f"✓ Image saved: {filepath}")
        
        # Create submission in Firestore
        submission_data = {
            'exam_id': exam_id,
            'exam_code': exam_code,
            'exam_title': exam_data.get('title'),
            'student_id': user['uid'],
            'student_email': user['email'],
            'student_name': user.get('name', user.get('email')),
            'image_filename': filename,
            'image_path': filepath,
            'status': 'pending',
            'submitted_at': datetime.utcnow().isoformat(),
            'total_points': exam_data.get('total_points', 0),
            'score': None,
            'percentage': None,
            'results': []
        }
        
        submission_ref = db.collection('submissions').document()
        submission_ref.set(submission_data)
        
        print(f"✓ Created submission: {submission_ref.id}")
        print(f"========================\n")
        
        return {
            "success": True,
            "submission_id": submission_ref.id,
            "message": "Exam submitted successfully",
            "status": "pending"
        }
    
    except Exception as e:
        print(f"✗ Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/api/submissions/{submission_id}/image")
async def get_submission_image(
    submission_id: str,
    user: dict = Depends(get_current_user)
):
    """Get submission image (for authorized users)"""
    db = get_db()
    
    submission_doc = db.collection('submissions').document(submission_id).get()
    if not submission_doc.exists:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    submission = submission_doc.to_dict()
    
    # Check authorization
    is_owner = submission['student_id'] == user['uid']
    
    exam_doc = db.collection('exams').document(submission['exam_id']).get()
    is_teacher = False
    if exam_doc.exists:
        exam_data = exam_doc.to_dict()
        is_teacher = exam_data.get('teacher_id') == user['uid']
    
    if not (is_owner or is_teacher):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Return image file
    image_path = submission['image_path']
    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail="Image not found")
    
    return FileResponse(image_path, media_type="image/jpeg")

@router.post("/api/exams/grade-submission")
async def grade_submission(
    submission_id: str = Form(...),
    user: dict = Depends(require_teacher)
):
    """Teacher grades submission with auto resize & crop"""
    db = get_db()
    
    print(f"\n{'='*60}")
    print(f"GRADING SUBMISSION: {submission_id}")
    print(f"{'='*60}")
    
    # Get submission
    submission_ref = db.collection('submissions').document(submission_id)
    submission_doc = submission_ref.get()
    
    if not submission_doc.exists:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    submission = submission_doc.to_dict()
    
    # Get exam
    exam_doc = db.collection('exams').document(submission['exam_id']).get()
    if not exam_doc.exists:
        raise HTTPException(status_code=404, detail="Exam not found")
    
    exam_data = exam_doc.to_dict()
    
    # Verify teacher owns exam
    if exam_data['teacher_id'] != user['uid']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Load and resize image to standard size
    image_path = submission['image_path']
    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail=f"Image not found: {image_path}")
    
    image_np = cv2.imread(image_path)
    if image_np is None:
        raise HTTPException(status_code=400, detail="Could not read image")
    
    # RESIZE TO STANDARD SIZE
    original_size = image_np.shape[:2]
    image_np = cv2.resize(image_np, (TARGET_WIDTH, TARGET_HEIGHT))
    print(f"✓ Resized image: {original_size} → {image_np.shape}")
        # DEBUG: Save resized full sheet
    debug_dir = "debug_crops"
    os.makedirs(debug_dir, exist_ok=True)

    resized_path = os.path.join(debug_dir, f"{submission_id}_resized.jpg")
    cv2.imwrite(resized_path, image_np)

    print(f"Saved resized full sheet: {resized_path}")

    
    # Get marked regions from omr_config
    omr_config = exam_data.get('omr_config', {})
    regions = omr_config.get('regions', [])
    
    if not regions:
        raise HTTPException(
            status_code=400, 
            detail="No answer regions marked. Teacher must mark regions first."
        )
    
    print(f"✓ Found {len(regions)} marked regions")
    
    results = []
    total_score = 0.0
    max_score = exam_data.get('total_points', 0)
    
    # Group questions by type
    mcq_questions = [q for q in exam_data['questions'] if q['type'] == 'mcq']
    written_questions = [q for q in exam_data['questions'] if q['type'] == 'written']
    
    # ============ PROCESS MCQ REGION ============
    mcq_regions = [r for r in regions if r['type'] == 'mcq']
    if mcq_regions and mcq_questions:
        print(f"\n--- MCQ Processing ({len(mcq_questions)} questions) ---")
        try:
            mcq_region = mcq_regions[0]
            x, y, w, h = mcq_region['x'], mcq_region['y'], mcq_region['width'], mcq_region['height']
            
            # CROP MCQ region from resized image
            mcq_region_img = image_np[y:y+h, x:x+w]
            print(f"MCQ region cropped: {mcq_region_img.shape}")
                # DEBUG: Save cropped MCQ region on backend
            debug_dir = "debug_crops"
            os.makedirs(debug_dir, exist_ok=True)

            mcq_debug_path = os.path.join(debug_dir, f"{submission_id}_mcq_crop.jpg")
            cv2.imwrite(mcq_debug_path, mcq_region_img)

            print(f"Saved MCQ crop for debugging: {mcq_debug_path}")

            
            # Save region as temporary file
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                cv2.imwrite(tmp.name, mcq_region_img)
                tmp_path = tmp.name
            
            try:
                # Convert to UploadFile
                with open(tmp_path, 'rb') as f:
                    from fastapi import UploadFile
                    from io import BytesIO
                    
                    file_content = f.read()
                    upload_file = UploadFile(
                        filename="mcq_region.jpg",
                        file=BytesIO(file_content)
                    )
                    
                    num_mcq = len(mcq_questions)
                    # options_per_question = len(mcq_questions[0].get('options', [])) if mcq_questions else 4
                    options_per_question = 5
                    print(f"Calling process_omr: {num_mcq} questions, {options_per_question} options")
                    
                    # Use your working process_omr
                    omr_result = await process_omr(
                        image=upload_file,
                        num_questions=num_mcq,
                        options_per_question=options_per_question
                    )
                    
                    mcq_answers = omr_result['answers']
                    print(f"OMR Results: {mcq_answers}")
                    print(f"Bubbles detected: {omr_result['total_bubbles_detected']}")
                    print(f"Marked bubbles: {omr_result['marked_bubbles']}")
            
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            
            # Match answers to questions
            for idx, question in enumerate(mcq_questions):
                q_id = question['question_id']
                omr_key = str(idx + 1)
                
                student_ans = mcq_answers.get(omr_key, "BLANK")
                correct_ans = question['correct_answer']
                points = question['points']
                
                if student_ans == "BLANK":
                    score = 0.0
                    display_ans = "No answer"
                elif student_ans == "MULTIPLE":
                    score = 0.0
                    display_ans = "Multiple answers marked"
                else:
                    score = points if student_ans == correct_ans else 0.0
                    display_ans = student_ans
                
                print(f"Q{q_id}: Student={student_ans}, Correct={correct_ans}, Score={score}/{points}")
                
                results.append({
                    'question_id': q_id,
                    'question_text': question.get('question_text', ''),
                    'student_answer': display_ans,
                    'correct_answer': correct_ans,
                    'score': round(score, 2),
                    'max_points': points,
                    'type': 'mcq'
                })
                
                total_score += score
            
            print(f"✓ MCQ complete. Subtotal: {total_score}/{sum(q['points'] for q in mcq_questions)}")
            print("MCQ answers returned by OMR:", mcq_answers)
            for idx, question in enumerate(mcq_questions):
                omr_key = str(idx + 1)
                student_ans = mcq_answers.get(omr_key, "BLANK")
                print(f"Q{question['question_id']} -> student_ans: {student_ans}, correct_answer: {question['correct_answer']}")

        
        except Exception as e:
            print(f"✗ MCQ error: {str(e)}")
            import traceback
            traceback.print_exc()
            
            for question in mcq_questions:
                results.append({
                    'question_id': question['question_id'],
                    'question_text': question.get('question_text', ''),
                    'student_answer': f'Error: {str(e)[:50]}',
                    'correct_answer': question['correct_answer'],
                    'score': 0.0,
                    'max_points': question['points'],
                    'type': 'mcq',
                    'error': str(e)
                })
    
    # ============ PROCESS WRITTEN REGIONS ============
    written_regions = [r for r in regions if r['type'] == 'written']
    if written_regions and written_questions:
        print(f"\n--- Written Processing ({len(written_questions)} questions) ---")
    
    for idx, region in enumerate(written_regions):
        if idx >= len(written_questions):
            break
        
        question = written_questions[idx]
        q_id = question['question_id']
        
        try:
            x, y, w, h = region['x'], region['y'], region['width'], region['height']
            
            # CROP written region from resized image
            region_img = image_np[y:y+h, x:x+w]
            print(f"Q{q_id}: Cropped region {region_img.shape}")
            
            # OCR
            region_pil = Image.fromarray(cv2.cvtColor(region_img, cv2.COLOR_BGR2RGB))
            student_text = perform_ocr(region_pil)
            
            print(f"Q{q_id}: OCR='{student_text[:80]}'...")
            
            # GPT comparison
            similarity = compare_answers_with_gpt(
                student_text,
                question['correct_answer'],
                question.get('question_text', '')
            )
            
            score = similarity * question['points']
            
            print(f"Q{q_id}: Similarity={similarity:.2f}, Score={score:.2f}/{question['points']}")
            
            results.append({
                'question_id': q_id,
                'question_text': question.get('question_text', ''),
                'student_answer': student_text or "No answer detected",
                'correct_answer': question['correct_answer'],
                'score': round(score, 2),
                'max_points': question['points'],
                'type': 'written',
                'similarity': round(similarity, 2)
            })
            
            total_score += score
        
        except Exception as e:
            print(f"✗ Q{q_id} error: {str(e)}")
            results.append({
                'question_id': q_id,
                'question_text': question.get('question_text', ''),
                'student_answer': f'Error: {str(e)[:50]}',
                'correct_answer': question['correct_answer'],
                'score': 0.0,
                'max_points': question['points'],
                'type': 'written',
                'error': str(e)
            })
    
    # Calculate final percentage
    percentage = (total_score / max_score * 100) if max_score > 0 else 0
    
    print(f"\n{'='*60}")
    print(f"FINAL: {total_score:.2f}/{max_score} ({percentage:.1f}%)")
    print(f"{'='*60}\n")
    
    # Update submission
    submission_ref.update({
        'status': 'graded',
        'score': round(total_score, 2),
        'percentage': round(percentage, 2),
        'results': results,
        'graded_at': datetime.utcnow().isoformat(),
        'graded_by': user['uid']
    })
    
    return {
        "success": True,
        "submission_id": submission_id,
        "total_score": round(total_score, 2),
        "max_score": max_score,
        "percentage": round(percentage, 2),
        "results": results
    }


@router.get("/api/exams/{exam_code}/submissions")
async def get_exam_submissions(
    exam_code: str,
    user: dict = Depends(require_teacher)
):
    """Get all submissions for an exam"""
    db = get_db()
    
    exams = db.collection('exams').where('exam_code', '==', exam_code).limit(1).stream()
    exam_doc = None
    for e in exams:
        exam_doc = e
        break
    
    if not exam_doc:
        raise HTTPException(status_code=404, detail="Exam not found")
    
    exam_data = exam_doc.to_dict()
    if exam_data['teacher_id'] != user['uid']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    submissions = db.collection('submissions')\
        .where('exam_code', '==', exam_code)\
        .stream()
    
    submission_list = []
    for sub in submissions:
        sub_data = sub.to_dict()
        sub_data['id'] = sub.id
        submission_list.append(sub_data)
    
    return submission_list


@router.get("/api/submissions/{submission_id}")
async def get_submission_detail(
    submission_id: str,
    user: dict = Depends(get_current_user)
):
    """Get submission details"""
    db = get_db()
    
    submission_doc = db.collection('submissions').document(submission_id).get()
    if not submission_doc.exists:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    submission = submission_doc.to_dict()
    submission['id'] = submission_id
    
    # Check authorization
    is_owner = submission['student_id'] == user['uid']
    
    exam_doc = db.collection('exams').document(submission['exam_id']).get()
    is_teacher = False
    if exam_doc.exists:
        exam_data = exam_doc.to_dict()
        is_teacher = exam_data.get('teacher_id') == user['uid']
    
    if not (is_owner or is_teacher):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return submission


@router.get("/api/students/submissions")
async def get_student_submissions(
    user: dict = Depends(require_student)
):
    """Get all submissions for logged-in student"""
    db = get_db()
    
    submissions = db.collection('submissions')\
        .where('student_id', '==', user['uid'])\
        .stream()
    
    submission_list = []
    for sub in submissions:
        sub_data = sub.to_dict()
        sub_data['id'] = sub.id
        
        try:
            exam_doc = db.collection('exams').document(sub_data['exam_id']).get()
            if exam_doc.exists:
                sub_data['exam_title'] = exam_doc.to_dict().get('title', 'Unknown Exam')
        except:
            pass
        
        submission_list.append(sub_data)
    
    return submission_list