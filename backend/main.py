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

class Answer(Basemodel):
    question_id: str
    type: str
    correct_answer: str
    points: float

class TestConfig(BaseModel):
    answers: List[Answer]
    omr_config:Optional[Dict]=None
    
class TestResult(BaseModel):
    total_score: float
    max_score: float
    details: List[Dict]
    
@app.on_event("startup")
async def load_models():
    global ocr_processor, ocr_model
    ocr_processor = TrOCRProcessor.from_pretrained("microsoft/trocr-base-handwritten")
    ocr_model = VisionEncoderDecoderModel.from_pretrained("microsoft/trocr-base-handwritten")
    
    ocr_model.to("cuda" if torch.cuda.is_available() else "cpu")
    
    ocr_model.eval()

@app.get("/")
async def root():
    return {"message": "Document OCR Service is running.", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy",
            "gpu_availbale": torch.cuda.is_available(),
            "model_loaded": ocr_model is not None}
    
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

def detect_mor_bubbles(image: np.ndarray, config: Dict) -> List[Dict]:
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
    
    for config in question_configs:
        if 'bbox' in config:  # bounding box [x, y, width, height]
            bbox = config['bbox']
            region = image.crop((bbox[0], bbox[1], bbox[0]+bbox[2], bbox[1]+bbox[3]))
            regions.append(region)
    return regions

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

@app.post("/check_test", response_model=TestResult)
async def check_test(
    test_image: UploadFile = File(...),
    test_config: str = File(...) #json string of testconfig
):
    """Main endpoint to check papers"""
    import json
    config = Testconfig(**json.loads(test_config))
    #Read uploaded image
    image_bytes = await test_image.read()
    image = Image.open(io.BytesIO(image_bytes))
    
    #Convert to numpy for OMR processing
    image_np = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    
    results = []
    total_score = 0.0
    max_score = sum(answer.points for answer in config.answers)
    
    for answer_config in config.answers:
        question_result = {
            "question_id": answer_config.question_id,
            "type": answer_config.type,
            "correct_answer": answer_config.correct_answer,
            "max_points": answer_config.points,
            "score": 0.0,
            "student_answer": ""
        }
        
        if answer_config.type == "written":
            #Extract region
            region = extract_answer_regions(image, [answer_config])[0]
            student_answer = perform_ocr(region)
            question_result["student_answer"] = student_answer
            
            #Compare with correct answer
            score_ratio = compare_answers_with_llms(student_answer, answer_config.correct_answer)
            question_result["score"] = score_ratio * answer_config.points
            question_result["similarity"] = score_ratio
            
        elif answer_config.type == "omr":
            #Detect OMR bubbles
            omr_results = detect_mor_bubbles(image_np, config.omr_config or {})
            student_answer = omr_results.get(answer_config.question_id, "")
            question_result["student_answer"] = student_answer
            
            #Simple exact match for OMR
            if student_answer == answer_config.correct_answer:
                question_result["score"] = answer_config.points
            else:
                question_result["score"] = 0.0
                
        total_score += question_result["score"]
        results.append(question_result)
    return TestResult(total_score=total_score, max_score=max_score, details=results)

@app.post("/ocr_test")
async def test_ocr(image: UploadFile - File(...)):
    """Endpoint to test OCR on a single image."""
    image_bytes = await image.read()
    pil_image = Image.open(io.BytesIO(image_bytes))
    extracted_text = perform_ocr(pil_image)
    return {"extracted_text": extracted_text}
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)