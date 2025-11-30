# utils/paper_detection.py - Paper detection utility

import cv2
import numpy as np
from typing import Tuple, Optional

class PaperDetector:
    """Detects and crops A4 paper from images"""
    
    def __init__(self, target_width: int = 2480, target_height: int = 3508):
        """A4 at 300 DPI"""
        self.target_width = target_width
        self.target_height = target_height
    
    def detect_and_crop(self, image_path: str) -> Tuple[Optional[np.ndarray], dict]:
        """Detect paper and return cropped image"""
        img = cv2.imread(image_path)
        if img is None:
            return None, {"error": "Could not read image"}
        
        original_height, original_width = img.shape[:2]
        
        # Resize for faster processing
        max_dim = 1500
        scale = min(max_dim / original_width, max_dim / original_height)
        if scale < 1:
            img_resized = cv2.resize(img, None, fx=scale, fy=scale)
        else:
            img_resized = img.copy()
            scale = 1
        
        # Find paper contour
        contour = self._find_paper_contour(img_resized)
        
        if contour is None:
            return img, {
                "detected": False,
                "message": "No paper detected, using original",
                "original_size": (original_width, original_height)
            }
        
        # Scale back to original
        contour = contour / scale
        
        # Apply perspective transform
        warped = self._four_point_transform(img, contour)
        
        # Resize to standard A4
        final = cv2.resize(warped, (self.target_width, self.target_height))
        
        return final, {
            "detected": True,
            "original_size": (original_width, original_height),
            "final_size": (self.target_width, self.target_height)
        }
    
    def _find_paper_contour(self, img: np.ndarray) -> Optional[np.ndarray]:
        """Find rectangular paper contour"""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edged = cv2.Canny(blurred, 50, 150)
        
        kernel = np.ones((5, 5), np.uint8)
        dilated = cv2.dilate(edged, kernel, iterations=1)
        
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return None
        
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]
        
        for contour in contours:
            peri = cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
            
            if len(approx) == 4:
                area = cv2.contourArea(approx)
                img_area = img.shape[0] * img.shape[1]
                if area > img_area * 0.2:
                    return approx.reshape(4, 2)
        
        return None
    
    def _order_points(self, pts: np.ndarray) -> np.ndarray:
        """Order points: TL, TR, BR, BL"""
        rect = np.zeros((4, 2), dtype="float32")
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]
        rect[2] = pts[np.argmax(s)]
        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)]
        rect[3] = pts[np.argmax(diff)]
        return rect
    
    def _four_point_transform(self, image: np.ndarray, pts: np.ndarray) -> np.ndarray:
        """Perspective transform"""
        rect = self._order_points(pts)
        (tl, tr, br, bl) = rect
        
        widthA = np.sqrt((br[0] - bl[0]) ** 2 + (br[1] - bl[1]) ** 2)
        widthB = np.sqrt((tr[0] - tl[0]) ** 2 + (tr[1] - tl[1]) ** 2)
        maxWidth = max(int(widthA), int(widthB))
        
        heightA = np.sqrt((tr[0] - br[0]) ** 2 + (tr[1] - br[1]) ** 2)
        heightB = np.sqrt((tl[0] - bl[0]) ** 2 + (tl[1] - bl[1]) ** 2)
        maxHeight = max(int(heightA), int(heightB))
        
        dst = np.array([
            [0, 0],
            [maxWidth - 1, 0],
            [maxWidth - 1, maxHeight - 1],
            [0, maxHeight - 1]
        ], dtype="float32")
        
        M = cv2.getPerspectiveTransform(rect, dst)
        warped = cv2.warpPerspective(image, M, (maxWidth, maxHeight))
        
        return warped


def process_submission_image(input_path: str, output_path: str) -> dict:
    """Process submission image with paper detection"""
    detector = PaperDetector()
    cropped_img, metadata = detector.detect_and_crop(input_path)
    
    if cropped_img is not None:
        cv2.imwrite(output_path, cropped_img)
        return {
            "success": True,
            "output_path": output_path,
            **metadata
        }
    else:
        return {
            "success": False,
            "error": metadata.get("error", "Unknown error")
        }