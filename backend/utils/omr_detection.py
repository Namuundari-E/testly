import cv2
import numpy as np
from typing import Dict, List, Tuple

class OMRDetector:
    """
    Enhanced OMR (Optical Mark Recognition) for detecting filled bubbles
    on multiple-choice test sheets
    """
    
    def __init__(self, bubble_threshold=0.7, min_bubble_area=50):
        """
        Args:
            bubble_threshold: Ratio of filled pixels to consider bubble as marked (0-1)
            min_bubble_area: Minimum area in pixels for valid bubble detection
        """
        self.bubble_threshold = bubble_threshold
        self.min_bubble_area = min_bubble_area
    
    def preprocess_image(self, image: np.ndarray) -> np.ndarray:
        """Preprocess image for better bubble detection"""
        # Convert to grayscale
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image
        
        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Adaptive thresholding works better than Otsu for varying lighting
        thresh = cv2.adaptiveThreshold(
            blurred, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, 11, 2
        )
        
        return thresh
    
    def detect_bubbles(self, image: np.ndarray) -> List[Dict]:
        """
        Detect all potential bubbles in the image
        Returns list of bubble info: {center, radius, filled_ratio}
        """
        thresh = self.preprocess_image(image)
        
        # Find contours
        contours, _ = cv2.findContours(
            thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        
        bubbles = []
        
        for contour in contours:
            # Calculate area
            area = cv2.contourArea(contour)
            
            if area < self.min_bubble_area:
                continue
            
            # Get bounding circle
            ((x, y), radius) = cv2.minEnclosingCircle(contour)
            
            # Check if contour is roughly circular
            circularity = self._calculate_circularity(contour, area)
            
            if circularity < 0.7:  # Not circular enough
                continue
            
            # Calculate filled ratio
            mask = np.zeros(thresh.shape, dtype=np.uint8)
            cv2.circle(mask, (int(x), int(y)), int(radius), 255, -1)
            
            bubble_pixels = cv2.bitwise_and(thresh, thresh, mask=mask)
            filled_ratio = np.count_nonzero(bubble_pixels) / np.count_nonzero(mask)
            
            bubbles.append({
                'center': (int(x), int(y)),
                'radius': int(radius),
                'area': area,
                'filled_ratio': filled_ratio,
                'is_marked': filled_ratio >= self.bubble_threshold
            })
        
        return bubbles
    
    def _calculate_circularity(self, contour, area):
        """Calculate how circular a contour is (1.0 = perfect circle)"""
        perimeter = cv2.arcLength(contour, True)
        if perimeter == 0:
            return 0
        circularity = 4 * np.pi * area / (perimeter * perimeter)
        return min(circularity, 1.0)
    
    def detect_grid_answers(
        self,
        image: np.ndarray,
        num_questions: int,
        options_per_question: int = 4,
        grid_config: Dict = None
    ) -> Dict[str, str]:
        """
        Detect answers in a grid layout (standard OMR sheet)
        
        Args:
            image: Input image
            num_questions: Number of questions
            options_per_question: Number of options (A, B, C, D, etc.)
            grid_config: Optional dict with 'top', 'left', 'width', 'height' to crop region
        
        Returns:
            Dict mapping question_id to selected answer (e.g., {'1': 'B', '2': 'A'})
        """
        # Crop to grid region if specified
        if grid_config:
            y1, y2 = grid_config['top'], grid_config['top'] + grid_config['height']
            x1, x2 = grid_config['left'], grid_config['left'] + grid_config['width']
            image = image[y1:y2, x1:x2]
        
        # Detect all bubbles
        bubbles = self.detect_bubbles(image)
        
        # Sort bubbles by position (top to bottom, left to right)
        bubbles = sorted(bubbles, key=lambda b: (b['center'][1], b['center'][0]))
        
        # Group bubbles into rows (questions)
        rows = self._group_into_rows(bubbles, num_questions)
        
        # Extract answers
        answers = {}
        option_labels = ['A', 'B', 'C', 'D', 'E', 'F'][:options_per_question]
        
        for question_idx, row in enumerate(rows):
            question_id = str(question_idx + 1)
            
            # Find marked bubble in this row
            marked = [b for b in row if b['is_marked']]
            
            if len(marked) == 1:
                # Find which option (A, B, C, D) is marked
                bubble_idx = row.index(marked[0])
                if bubble_idx < len(option_labels):
                    answers[question_id] = option_labels[bubble_idx]
            elif len(marked) > 1:
                # Multiple bubbles marked - mark as invalid
                answers[question_id] = "MULTIPLE"
            else:
                # No bubble marked
                answers[question_id] = "BLANK"
        
        return answers
    
    def _group_into_rows(self, bubbles: List[Dict], num_questions: int) -> List[List[Dict]]:
        """Group bubbles into rows (questions)"""
        if not bubbles:
            return []
        
        # Use K-means like clustering based on y-coordinate
        y_coords = [b['center'][1] for b in bubbles]
        
        # Simple row grouping: divide into equal segments
        height_range = max(y_coords) - min(y_coords)
        row_height = height_range / num_questions
        
        rows = [[] for _ in range(num_questions)]
        
        for bubble in bubbles:
            y = bubble['center'][1]
            row_idx = int((y - min(y_coords)) / row_height)
            row_idx = min(row_idx, num_questions - 1)  # Clamp to valid range
            rows[row_idx].append(bubble)
        
        # Sort each row by x-coordinate
        for row in rows:
            row.sort(key=lambda b: b['center'][0])
        
        return rows
    
    def visualize_detection(
        self,
        image: np.ndarray,
        bubbles: List[Dict],
        save_path: str = None
    ) -> np.ndarray:
        """
        Draw detected bubbles on image for debugging
        Green = marked, Red = unmarked
        """
        vis = image.copy()
        if len(vis.shape) == 2:
            vis = cv2.cvtColor(vis, cv2.COLOR_GRAY2BGR)
        
        for bubble in bubbles:
            center = bubble['center']
            radius = bubble['radius']
            color = (0, 255, 0) if bubble['is_marked'] else (0, 0, 255)
            
            cv2.circle(vis, center, radius, color, 2)
            cv2.putText(
                vis, f"{bubble['filled_ratio']:.2f}",
                (center[0] - 20, center[1] - radius - 5),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1
            )
        
        if save_path:
            cv2.imwrite(save_path, vis)
        
        return vis


# Usage example
if __name__ == "__main__":
    # Load test image
    image = cv2.imread("test_sheet.jpg")
    
    # Initialize detector
    detector = OMRDetector(bubble_threshold=0.7)
    
    # Method 1: Detect all bubbles
    bubbles = detector.detect_bubbles(image)
    print(f"Detected {len(bubbles)} bubbles")
    
    # Method 2: Detect answers in grid format
    answers = detector.detect_grid_answers(
        image,
        num_questions=20,
        options_per_question=4,
        grid_config={
            'top': 100,
            'left': 50,
            'width': 600,
            'height': 800
        }
    )
    
    print("Detected answers:", answers)
    
    # Visualize
    vis = detector.visualize_detection(image, bubbles, "detection_result.jpg")
    cv2.imshow("OMR Detection", vis)
    cv2.waitKey(0)