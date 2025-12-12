import cv2
import numpy as np
from paddleocr import PaddleOCR
import os
from datetime import datetime

class LetterOCR:
    """
    letter by letter ocr for mongolian. uses paddleocr's character recognition model
    """
    def __init__(self, debug_dir="/app/debug_images"):
        # Recognition-only mode for single characters
        self.ocr = PaddleOCR(
            use_angle_cls=True,
            lang="mn",  # Mongolian language model
            rec=True,
            det=True,
            use_gpu=False,
            show_log=False
        )
        self.allowed_characters = set(
            "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯӨҮабвгдеёжзийклмнопрстуфхцчшщъыьэюяөү"
        )
        
        # Create debug directory
        self.debug_dir = debug_dir
        os.makedirs(self.debug_dir, exist_ok=True)
        
        # Create timestamped subfolder for this session
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.session_dir = os.path.join(self.debug_dir, timestamp)
        os.makedirs(self.session_dir, exist_ok=True)
        print(f"Debug images will be saved to: {self.session_dir}")
    
    def preprocess_image(self, img):
        """Clean up letter image for better recognition"""
        # Get original dimensions
        h, w = img.shape[:2]
        
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Apply adaptive threshold for better contrast
        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY, 11, 2
        )
        
        # Invert if needed (text should be dark on light background)
        if np.mean(binary) < 127:
            binary = cv2.bitwise_not(binary)
        
        # Add padding to give the character breathing room
        pad = 10
        binary = cv2.copyMakeBorder(
            binary, pad, pad, pad, pad, 
            cv2.BORDER_CONSTANT, value=255
        )
        
        # Resize intelligently - keep aspect ratio, make larger
        new_h, new_w = binary.shape[:2]
        scale = min(200 / new_w, 200 / new_h)  # Scale up to max 200px
        if scale < 1:
            scale = 1  # Don't downscale
        
        new_w = int(new_w * scale)
        new_h = int(new_h * scale)
        
        resized = cv2.resize(binary, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        
        # Convert back to BGR for PaddleOCR
        result = cv2.cvtColor(resized, cv2.COLOR_GRAY2BGR)
        
        return result
    
    def recognize_letter(self, img, letter_index):
        """Recognize a single letter from an image"""
        try:
            # Save original cropped image
            original_path = os.path.join(self.session_dir, f"letter_{letter_index:02d}_original.png")
            cv2.imwrite(original_path, img)
            print(f"  💾 Saved original: {original_path}")
            
            # Preprocess the image
            processed_img = self.preprocess_image(img)
            
            # Save preprocessed image
            processed_path = os.path.join(self.session_dir, f"letter_{letter_index:02d}_processed.png")
            cv2.imwrite(processed_path, processed_img)
            print(f"  💾 Saved processed: {processed_path}")
            
            # Run OCR on the letter image
            result = self.ocr.ocr(processed_img, cls=True)
            
            print(f"  OCR Result: {result}")
            
            # Check if result is valid
            if not result or result[0] is None or len(result[0]) == 0:
                print("  ❌ No text detected in image")
                return ""
            
            # Extract text - PaddleOCR returns: [[box, (text, confidence)], ...]
            detected_texts = []
            for line in result[0]:
                if line and len(line) >= 2:
                    text, confidence = line[1]
                    detected_texts.append((text, confidence))
            
            if not detected_texts:
                print("  ❌ No valid text in result")
                return ""
            
            # Get the highest confidence result
            best_text, best_conf = max(detected_texts, key=lambda x: x[1])
            
            print(f"  Extracted text: '{best_text}' (confidence: {best_conf:.3f})")
            
            # Take first character
            if best_text and len(best_text) > 0:
                char = best_text[0].upper()  # Normalize to uppercase
                
                # Try both cases
                if char in self.allowed_characters:
                    return char
                elif char.lower() in self.allowed_characters:
                    return char.lower()
                else:
                    print(f"  ⚠️ Character '{char}' not in allowed set")
                    # Return it anyway for debugging - you can remove this later
                    return f"[{char}]"
            
            return ""
                
        except Exception as e:
            print(f"  ❌ Error recognizing letter: {e}")
            import traceback
            traceback.print_exc()
            return ""
    
    def recognize_from_boxes(self, boxes):
        """Recognize text from multiple bounding boxes"""
        text = ""
        
        print(f"\n{'='*50}")
        print(f"Processing {len(boxes)} letter boxes")
        print(f"Debug images saved to: {self.session_dir}")
        print(f"{'='*50}\n")
        
        for idx, box in enumerate(boxes):
            try:
                # Unpack all 5 values from extract_letter_boxes
                x, y, w, h, cropped_img = box
                
                print(f"Letter {idx + 1}/{len(boxes)} at ({x}, {y}), size: {w}x{h}")
                
                # Skip if the cropped image is empty or too small
                if cropped_img is None or cropped_img.size == 0:
                    print("  ❌ Empty crop, skipping\n")
                    continue
                
                # Recognize the letter from the cropped image
                letter = self.recognize_letter(cropped_img, idx + 1)
                
                if letter:
                    print(f"  ✓ Recognized: '{letter}'\n")
                    text += letter
                else:
                    print(f"  ❌ No letter recognized\n")
                
            except Exception as e:
                print(f"  ❌ Error processing box {idx}: {e}")
                import traceback
                traceback.print_exc()
                continue
        
        print(f"{'='*50}")
        print(f"Final text: '{text}'")
        print(f"Check images at: {self.session_dir}")
        print(f"{'='*50}\n")
        
        return text