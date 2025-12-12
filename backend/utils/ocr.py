import cv2
import numpy as np
import torch
from transformers import TrOCRProcessor, VisionEncoderDecoderModel
from PIL import Image

# Global references (loaded in main.py)
ocr_processor = None
ocr_model = None

# --------------------------------------------------------
# NOTEBOOK LINE DETECTION
# --------------------------------------------------------
def detect_notebook_ruling_lines(image, min_line_length=200):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(blurred, 30, 100, apertureSize=3)

    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi/180,
        threshold=int(w * 0.3),
        minLineLength=min_line_length,
        maxLineGap=30
    )

    horizontal_lines = []
    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = abs(np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi)
            if angle < 3:  # almost horizontal
                y_avg = (y1 + y2) // 2
                horizontal_lines.append(y_avg)

    horizontal_lines = sorted(set(horizontal_lines))

    # Filter lines by minimum spacing
    filtered_lines = []
    min_spacing = 15
    for i, y in enumerate(horizontal_lines):
        if i == 0 or y - filtered_lines[-1] > min_spacing:
            filtered_lines.append(y)

    return filtered_lines

def segment_lines_from_notebook(image, line_y_positions):
    h, w = image.shape[:2]
    line_regions = []

    if not line_y_positions:
        # fallback: divide into 35px regions
        num_lines = max(1, h // 35)
        line_y_positions = [i * 35 for i in range(num_lines + 1)]

    # Add top/bottom borders
    if line_y_positions[0] > 30:
        line_y_positions.insert(0, 0)
    if line_y_positions[-1] < h - 30:
        line_y_positions.append(h)

    for i in range(len(line_y_positions) - 1):
        y1 = line_y_positions[i]
        y2 = line_y_positions[i + 1]

        # small margin to avoid cutting text
        margin = 2
        y1_crop = min(y1 + margin, y2 - 1)
        y2_crop = max(y2 - margin, y1_crop + 1)

        if y2_crop - y1_crop >= 10:
            line_regions.append((y1_crop, y2_crop))

    return line_regions

# --------------------------------------------------------
# PREPROCESS LINE FOR TR-OCR
# --------------------------------------------------------
def preprocess_line_for_trocr(line_crop):
    h, w = line_crop.shape[:2]

    gray = cv2.cvtColor(line_crop, cv2.COLOR_BGR2GRAY)

    # Contrast enhancement
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # Adaptive threshold
    binary = cv2.adaptiveThreshold(
        enhanced, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=15,
        C=10
    )

    # Ensure black text on white background
    if np.mean(binary) < 127:
        binary = cv2.bitwise_not(binary)

    processed = cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)

    target_height = 64
    scale = target_height / h
    new_width = int(w * scale)

    resized = cv2.resize(processed, (new_width, target_height), interpolation=cv2.INTER_CUBIC)
    return resized

# --------------------------------------------------------
# OCR ON SINGLE LINE
# --------------------------------------------------------
def ocr_line(img_crop):
    img_crop = preprocess_line_for_trocr(img_crop)
    pil_img = Image.fromarray(cv2.cvtColor(img_crop, cv2.COLOR_BGR2RGB))

    pixel_values = ocr_processor(images=pil_img, return_tensors="pt").pixel_values

    with torch.no_grad():
        generated_ids = ocr_model.generate(
            pixel_values,
            max_length=128,
            num_beams=5,
            early_stopping=True
        )

    text = ocr_processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
    return text

# --------------------------------------------------------
# MAIN OCR FUNCTION
# --------------------------------------------------------
import os
os.makedirs("/app/debug_lines", exist_ok=True)

def run_ocr(image=None, image_path=None, batch_size=8):
    """
    Perform OCR on a notebook-style image.
    Accepts either:
        - image_path: path to image file
        - image: PIL Image or NumPy array
    Returns:
        extracted_lines: list of text lines
        regions: list of (y1, y2) line regions
    """
    if ocr_processor is None or ocr_model is None:
        raise ValueError("OCR processor and model must be provided")
    # Load image if path is given
    if image_path:
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Could not read image: {image_path}")

    # Convert PIL to np array
    if isinstance(image, Image.Image):
        image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    elif not isinstance(image, np.ndarray):
        raise ValueError("image must be a PIL Image or NumPy array")

    # Detect ruling lines and segment
    ruling = detect_notebook_ruling_lines(image)
    regions = segment_lines_from_notebook(image, ruling)

    extracted_lines = []
    for idx,(y1, y2) in enumerate(regions):
        line_crop = image[y1:y2, :]
        cv2.imwrite(f"/app/debug_lines/line_{idx}.png", line_crop)
        if line_crop.size == 0 or line_crop.shape[0] < 5:
            continue
            # Skip almost empty lines
        gray_crop = cv2.cvtColor(line_crop, cv2.COLOR_BGR2GRAY)
        non_empty_ratio = cv2.countNonZero(255 - gray_crop) / (gray_crop.shape[0]*gray_crop.shape[1])
        if non_empty_ratio < 0.01:
            print(f"Line {idx} is empty, skipping OCR")
            continue

        try:
            text = ocr_line(line_crop)
            print(f"Line {idx}: OCR='{text}'")
            if text.strip():
                extracted_lines.append(text)
        except Exception as e:
            continue
    final_text = " ".join(extracted_lines) if extracted_lines else ""
    return {
        "text": final_text,
        "regions": regions}
