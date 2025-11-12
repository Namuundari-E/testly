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
    
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)