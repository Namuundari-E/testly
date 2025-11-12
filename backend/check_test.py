from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List,Dict,Optional
import torch
from PIL import Image
import io
import cv2
import numpy as np

from omr_detection import OMRDetector

class TestResult(BaseModel):
    total_score: float
    max_score: float
    details: List[Dict]
class Answer(BaseModel):
    question_id: str
    type: str
    correct_answer: str
    points: float
class TestConfig(BaseModel):
    answers: List[Answer]
    omr_config:Optional[Dict]=None
    
ocr_processor = None
ocr_model = None
omr_detector = None

async def check_test(
    test_image: UploadFile = File(...),
    test_config: str = File(...) #json string of testconfig
):
    """Main endpoint to check papers"""
    import json
    #Parse test configuration
    config = TestConfig(**json.loads(test_config))
    #Read uploaded image
    image_bytes = await test_image.read()
    image = Image.open(io.BytesIO(image_bytes))
    
    #Convert to numpy for OMR processing
    image_np = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    
    results = []
    total_score = 0.0
    max_score = sum(answer.points for answer in config.answers)
    
     # Separate MCQ and written questions
    mcq_questions = [a for a in config.answers if a.type == "mcq"]
    written_questions = [a for a in config.answers if a.type == "written"]
    
    # Process MCQ questions with OMR
    if mcq_questions and omr_detector:
        try:
            # Detect OMR answers
            omr_config = config.omr_config or {}
            num_questions = len(mcq_questions)
            options_per_question = omr_config.get('options_per_question', 4)
            
            omr_results = omr_detector.detect_grid_answers(
                image_np,
                num_questions=num_questions,
                options_per_question=options_per_question,
                grid_config=omr_config.get('grid_region')
            )
            
            # Check MCQ answers
            for answer_config in mcq_questions:
                question_result = {
                    "question_id": answer_config.question_id,
                    "type": "mcq",
                    "student_answer": omr_results.get(answer_config.question_id, "BLANK"),
                    "correct_answer": answer_config.correct_answer,
                    "score": 0.0,
                    "max_points": answer_config.points
                }
                
                student_answer = omr_results.get(answer_config.question_id, "")
                
                # Check if correct
                if student_answer == answer_config.correct_answer:
                    question_result["score"] = answer_config.points
                elif student_answer == "MULTIPLE":
                    question_result["error"] = "Multiple answers marked"
                elif student_answer == "BLANK":
                    question_result["error"] = "No answer marked"
                
                total_score += question_result["score"]
                results.append(question_result)
                
        except Exception as e:
            print(f"OMR detection error: {e}")
            # Fall back to placeholder for MCQ
            for answer_config in mcq_questions:
                question_result = {
                    "question_id": answer_config.question_id,
                    "type": "mcq",
                    "student_answer": "ERROR",
                    "correct_answer": answer_config.correct_answer,
                    "score": 0.0,
                    "max_points": answer_config.points,
                    "error": str(e)
                }
                results.append(question_result)
    
    # Process written questions with OCR
    for answer_config in written_questions:
        question_result = {
            "question_id": answer_config.question_id,
            "type": "written",
            "student_answer": "",
            "correct_answer": answer_config.correct_answer,
            "score": 0.0,
            "max_points": answer_config.points
        }
        
        try:
            # For now, OCR the entire image (you can add region extraction)
            recognized_text = perform_ocr(image)
            question_result["student_answer"] = recognized_text
            
            # Use LLM to compare answers
            similarity = compare_answers_with_llms(recognized_text, answer_config.correct_answer)
            question_result["score"] = similarity * answer_config.points
            question_result["similarity"] = similarity
            
        except Exception as e:
            print(f"OCR error for question {answer_config.question_id}: {e}")
            question_result["error"] = str(e)
        
        total_score += question_result["score"]
        results.append(question_result)
    
    return TestResult(
        total_score=total_score,
        max_score=max_score,
        details=results
    )

async def process_ocr(image: UploadFile = File(...)):
    """Endpoint to test OCR on a single image."""
    image_bytes = await image.read()
    pil_image = Image.open(io.BytesIO(image_bytes))
    extracted_text = perform_ocr(pil_image)
    return {"extracted_text": extracted_text}

def perform_ocr(image: Image.Image) -> str:
    """Perform OCR on the single given image and return the extracted text."""
    if ocr_processor is None or ocr_model is None:
        raise HTTPException(status_code=503, detail="OCR model not loaded")
    
    image = image.convert("RGB")
    pixel_values = ocr_processor(images=image, return_tensors="pt").pixel_values
    pixel_values = pixel_values.to("cuda" if torch.cuda.is_available() else "cpu")
    
    with torch.no_grad():
        generated_ids = ocr_model.generate(pixel_values)
    
    generated_text = ocr_processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
    return generated_text

async def process_omr(
    image: UploadFile = File(...),
    num_questions: int = 5,
    options_per_question: int = 4
):
    """Test endpoint for OMR functionality"""
    if omr_detector is None:
        raise HTTPException(status_code=500, detail="OMR detector not loaded")
    
    image_bytes = await image.read()
    image = Image.open(io.BytesIO(image_bytes))
    image_np = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    
    # Detect bubbles
    bubbles = omr_detector.detect_bubbles(image_np)
    
    # Detect grid answers
    answers = omr_detector.detect_grid_answers(
        image_np,
        num_questions=num_questions,
        options_per_question=options_per_question
    )
    
    return {
        "total_bubbles_detected": len(bubbles),
        "marked_bubbles": len([b for b in bubbles if b['is_marked']]),
        "answers": answers,
        "bubbles": bubbles[:10]  # First 10 bubbles for debugging
    }
    
def compare_answers_with_llms(student_answer: str, correct_answer: str) -> float:
    """Compare student answer with correct answer using LLMs (stub function).
    Returns a score between o and 1 
    TODO: Integrate with an LLM API for semantic comparison.
    """
    student_words = set(student_answer.lower().split())
    correct_words = set(correct_answer.lower().split())
    
    if len(correct_words) == 0:
        return 0.0
    overlap = len(student_words.intersection(correct_words))
    similarity = overlap / len(correct_words)
    return similarity