# check_test.py - Updated to work with your system

from fastapi import UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional
from dotenv import load_dotenv
load_dotenv()
import torch
from PIL import Image
import io
import cv2
import numpy as np
import openai
import os

# Your existing models - KEEP AS IS
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
    omr_config: Optional[Dict] = None

class QuestionModel(BaseModel):
    question_id: str
    question_text: str
    type: str
    options: Optional[List[str]]
    correct_answer: str
    points: float

class ExamCreate(BaseModel):
    title: str
    description: Optional[str]
    duration_minutes: int
    questions: List[QuestionModel]
    omr_config: Optional[dict] = None

class ExamUpdate(BaseModel):  
    title: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    questions: Optional[List[Dict]] = None
    is_active: Optional[bool] = None
    omr_config: Optional[Dict] = None

# Global references (loaded in main.py)
ocr_processor = None
ocr_model = None
omr_detector = None

# Configure OpenAI (add your API key)
openai.api_key = os.getenv("OPENAI_API_KEY")


async def check_test(
    test_image: UploadFile = File(...),
    test_config: str = File(...)
):
    """Main endpoint to check papers - YOUR ORIGINAL LOGIC"""
    import json
    
    config = TestConfig(**json.loads(test_config))
    image_bytes = await test_image.read()
    image = Image.open(io.BytesIO(image_bytes))
    image_np = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    
    results = []
    total_score = 0.0
    max_score = sum(answer.points for answer in config.answers)
    
    mcq_questions = [a for a in config.answers if a.type == "mcq"]
    written_questions = [a for a in config.answers if a.type == "written"]
    
    # Process MCQ with YOUR OMR detector
    if mcq_questions and omr_detector:
        try:
            omr_config = config.omr_config or {}
            num_questions = len(mcq_questions)
            options_per_question = omr_config.get('options_per_question', 5)
            
            omr_results = omr_detector.detect_grid_answers(
                image_np,
                num_questions=num_questions,
                options_per_question=options_per_question,
                grid_config=omr_config.get('grid_region')
            )
            
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
    
    # Process written questions with OCR + GPT
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
            recognized_text = perform_ocr(image)
            question_result["student_answer"] = recognized_text
            
            # Use GPT for better comparison
            similarity = compare_answers_with_gpt(
                recognized_text, 
                answer_config.correct_answer,
                answer_config.question_id
            )
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
    """Test OCR endpoint - YOUR ORIGINAL"""
    image_bytes = await image.read()
    pil_image = Image.open(io.BytesIO(image_bytes))
    extracted_text = perform_ocr(pil_image)
    return {"extracted_text": extracted_text}


def perform_ocr(image: Image.Image) -> str:
    """Perform OCR - YOUR ORIGINAL LOGIC"""
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
    options_per_question: int = 5
):
    """Test OMR endpoint - YOUR ORIGINAL"""
    if omr_detector is None:
        raise HTTPException(status_code=500, detail="OMR detector not loaded")
    
    image_bytes = await image.read()
    image = Image.open(io.BytesIO(image_bytes))
    image_np = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    
    bubbles = omr_detector.detect_bubbles(image_np)
    answers = omr_detector.detect_grid_answers(
        image_np,
        num_questions=num_questions,
        options_per_question=options_per_question
    )
    
    return {
        "total_bubbles_detected": len(bubbles),
        "marked_bubbles": len([b for b in bubbles if b['is_marked']]),
        "answers": answers,
        "bubbles": bubbles[:10]
    }


def compare_answers_with_gpt(student_answer: str, correct_answer: str, question_text: str = "") -> float:
    """
    Enhanced comparison using GPT-4 for semantic similarity
    Falls back to word overlap if GPT fails
    """
    try:
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {
                    "role": "system",
                    "content": """You are grading exam answers.Compare the student's answer with the correct answer and rate their similarity based on OVERALL MEANING and KEY CONCEPTS, not exact wording.
IMPORTANT:
- The student's handwriting may have OCR errors (misread letters/words)
- Focus on the core ideas and concepts, not perfect spelling
- If the main concept is correct despite OCR errors, give a high score
- Return ONLY a number between 0.0 and 1.0
- 1.0 = Perfect understanding (all key concepts present)
- 0.7-0.9 = Good understanding (most concepts, minor errors)
- 0.4-0.6 = Partial understanding (some concepts missing)
- 0.0-0.3 = Poor/incorrect understanding"""
                },
                {
                    "role": "user",
                    "content": f"""Question: {question_text}

Correct Answer: {correct_answer}

Student Answer: {student_answer}

Rate correctness from 0.0 (completely wrong) to 1.0 (perfect). Return only the number."""
                }
            ],
            temperature=0.3,
            max_tokens=10
        )
        
        similarity_str = response.choices[0].message.content.strip()
        similarity = float(similarity_str)
        return max(0.0, min(1.0, similarity))
        
    except Exception as e:
        print(f"GPT comparison error: {e}, falling back to word overlap")
        return compare_answers_with_llms(student_answer, correct_answer)


def compare_answers_with_llms(student_answer: str, correct_answer: str) -> float:
    """
    Fallback word overlap comparison - YOUR ORIGINAL LOGIC
    """
    student_words = set(student_answer.lower().split())
    correct_words = set(correct_answer.lower().split())
    
    if len(correct_words) == 0:
        return 0.0
    
    overlap = len(student_words.intersection(correct_words))
    similarity = overlap / len(correct_words)
    return similarity