import cv2

def extract_letter_boxes(img):
    """
    Extract each letter box region from exam template.
    Returns: list of (x, y, w, h, cropped_img)
    """

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, bw = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)

    # Find rectangles (letter boxes)
    contours, _ = cv2.findContours(bw, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    boxes = []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)

        # Filter small/noise
        if w < 30 or h < 30:
            continue
        if w > 200 or h > 200:
            continue

        crop = img[y:y+h, x:x+w]
        boxes.append((x, y, w, h, crop))

    # Sort left → right
    boxes = sorted(boxes, key=lambda b: (b[1], b[0]))

    return boxes
