"""
ocr_utils.py - OCR utility functions for Mongolian Cyrillic text detection
Place this file in the same directory as your main grading script
"""

import cv2
import numpy as np
import torch
from PIL import Image
from typing import List, Tuple
import logging
from scipy.ndimage import gaussian_filter1d

logger = logging.getLogger(__name__)
# ocr_detector.py
ocr_processor = None
ocr_model = None
device = "cpu"   # safe fallback


def initialize_ocr_model(processor, model, device_name):
    """Initialize global OCR model variables"""
    global ocr_processor, ocr_model, device
    ocr_processor = processor
    ocr_model = model
    device = device_name
    logger.info(f"OCR model initialized on device: {device}")


def preprocess_image(image: np.ndarray) -> np.ndarray:
    """Preprocess image for better OCR accuracy"""
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
    
    # Apply CLAHE for better contrast
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    gray = clahe.apply(gray)
    
    # Denoise more aggressively
    denoised = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)
    
    # Try Otsu's thresholding first
    _, binary = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    # Invert if background is dark
    if np.mean(binary) < 127:
        binary = cv2.bitwise_not(binary)
    
    # Morphological operations to clean up
    kernel = np.ones((2,2), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    
    return binary


def detect_lines(image: np.ndarray, min_line_height: int = 10) -> List[Tuple[int, int, np.ndarray]]:
    """Detect text lines with improved algorithm"""
    binary = preprocess_image(image)
    
    # Horizontal projection with smoothing
    h_projection = np.sum(binary == 0, axis=1)
    
    # Smooth the projection to handle noise
    h_projection_smooth = gaussian_filter1d(h_projection.astype(float), sigma=2)
    
    # Dynamic threshold based on content
    threshold = np.mean(h_projection_smooth) * 0.2
    
    in_line = False
    lines = []
    start = 0
    
    for i, val in enumerate(h_projection_smooth):
        if val > threshold and not in_line:
            start = max(0, i - 2)  # Add small margin
            in_line = True
        elif val <= threshold and in_line:
            end = min(len(h_projection_smooth), i + 2)  # Add small margin
            if end - start > min_line_height:
                lines.append((start, end, binary[start:end, :]))
            in_line = False
    
    if in_line and len(h_projection_smooth) - start > min_line_height:
        lines.append((start, len(h_projection_smooth), binary[start:, :]))
    
    logger.info(f"Detected {len(lines)} lines")
    return lines


def detect_words(line_image: np.ndarray, min_word_width: int = 5) -> List[Tuple[int, int, np.ndarray]]:
    """Detect words in a line with improved algorithm"""
    v_projection = np.sum(line_image == 0, axis=0)
    
    # Smooth projection
    v_projection_smooth = gaussian_filter1d(v_projection.astype(float), sigma=1)
    
    # Dynamic threshold
    threshold = np.mean(v_projection_smooth) * 0.15
    
    in_word = False
    words = []
    start = 0
    gap_count = 0
    min_gap = 5  # Reduced gap for better word separation
    
    for i, val in enumerate(v_projection_smooth):
        if val > threshold:
            if not in_word:
                start = max(0, i - 1)
                in_word = True
            gap_count = 0
        else:
            if in_word:
                gap_count += 1
                if gap_count >= min_gap:
                    end = min(len(v_projection_smooth), i - gap_count + 1)
                    if end - start > min_word_width:
                        words.append((start, end, line_image[:, start:end]))
                    in_word = False
    
    if in_word and len(v_projection_smooth) - start > min_word_width:
        words.append((start, len(v_projection_smooth), line_image[:, start:]))
    
    return words


def resize_for_model(image: np.ndarray, target_size: Tuple[int, int] = (384, 384)) -> Image.Image:
    """Resize maintaining aspect ratio"""
    h, w = image.shape[:2]
    scale = min(target_size[0] / w, target_size[1] / h)
    new_w, new_h = int(w * scale), int(h * scale)
    
    resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
    pil_img = Image.fromarray(resized).convert("RGB")
    
    padded = Image.new("RGB", target_size, (255, 255, 255))
    padded.paste(pil_img, ((target_size[0] - new_w) // 2, (target_size[1] - new_h) // 2))
    
    return padded


def perform_ocr_batch(images: List[Image.Image]) -> List[str]:
    """Perform OCR on batch of images"""
    if not images:
        return []
    
    if ocr_processor is None or ocr_model is None:
        raise RuntimeError("OCR model not initialized. Call initialize_ocr_model() first.")
    
    pixel_values = ocr_processor(images=images, return_tensors="pt").pixel_values
    pixel_values = pixel_values.to(device)
    
    with torch.no_grad():
        generated_ids = ocr_model.generate(pixel_values, max_length=64)
    
    texts = ocr_processor.batch_decode(generated_ids, skip_special_tokens=True)
    return texts


def perform_ocr_advanced(image: Image.Image, batch_size: int = 8) -> dict:
    """
    Perform OCR with line/word detection and detailed logging
    
    Args:
        image: PIL Image to process
        batch_size: Number of words to process in each batch
        
    Returns:
        dict with keys: text, lines, words, method, word_details
    """
    img_array = np.array(image)
    
    logger.info(f"Processing image of size: {img_array.shape}")
    
    # Detect lines
    lines = detect_lines(img_array)
    
    if len(lines) == 0:
        logger.warning("No lines detected, processing full image")
        preprocessed = preprocess_image(img_array)
        pil_img = resize_for_model(preprocessed)
        result = perform_ocr_batch([pil_img])
        return {
            "text": result[0] if result else "",
            "lines": 0,
            "words": 0,
            "method": "full_image",
            "debug_info": "No lines detected"
        }
    
    full_text = []
    total_words = 0
    word_details = []
    
    for line_idx, (y_start, y_end, line_img) in enumerate(lines):
        logger.info(f"Processing line {line_idx + 1}/{len(lines)}")
        
        # Detect words in line
        words = detect_words(line_img)
        logger.info(f"  Found {len(words)} words in line {line_idx + 1}")
        
        if len(words) == 0:
            continue
        
        line_text = []
        
        # Process words in batches
        for i in range(0, len(words), batch_size):
            batch_words = words[i:i + batch_size]
            
            # Resize and prepare images
            batch_images = [resize_for_model(word[2]) for word in batch_words]
            
            # Perform OCR
            batch_texts = perform_ocr_batch(batch_images)
            
            # Log each word
            for word_idx, text in enumerate(batch_texts):
                logger.info(f"    Word {i + word_idx + 1}: '{text}'")
                word_details.append({
                    "line": line_idx + 1,
                    "word_num": i + word_idx + 1,
                    "text": text
                })
            
            line_text.extend(batch_texts)
        
        total_words += len(words)
        full_text.append(" ".join(line_text))
    
    result_text = "\n".join(full_text)
    logger.info(f"Final result: {len(lines)} lines, {total_words} words")
    
    return {
        "text": result_text,
        "lines": len(lines),
        "words": total_words,
        "method": "line_word_detection",
        "word_details": word_details
    }


def perform_ocr_simple(image: Image.Image) -> str:
    """
    Simple OCR without line/word detection
    
    Args:
        image: PIL Image to process
        
    Returns:
        Extracted text string
    """
    if ocr_processor is None or ocr_model is None:
        raise RuntimeError("OCR model not initialized. Call initialize_ocr_model() first.")
    
    # Ensure RGB
    if image.mode != 'RGB':
        image = image.convert('RGB')
    
    pixel_values = ocr_processor(images=image, return_tensors="pt").pixel_values
    pixel_values = pixel_values.to(device)
    
    with torch.no_grad():
        generated_ids = ocr_model.generate(pixel_values)
    
    text = ocr_processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
    return text