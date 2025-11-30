// PaperScanner.js
import { useState, useEffect, useRef } from 'react';
import { Check, X, RotateCcw } from 'lucide-react';

export default function PaperScanner({ image, onConfirm, onCancel }) {
  const [corners, setCorners] = useState(null);
  const [draggingCorner, setDraggingCorner] = useState(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);

  useEffect(() => {
    if (image) {
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        detectCorners(img);
      };
      img.src = image;
    }
  }, [image]);

  useEffect(() => {
    if (imageRef.current && corners) {
      drawCanvas();
    }
  }, [corners]);

  const detectCorners = (img) => {
    const margin = 50;
    const width = img.width;
    const height = img.height;
    
    setCorners([
      { x: margin, y: margin, label: 'TL' },
      { x: width - margin, y: margin, label: 'TR' },
      { x: width - margin, y: height - margin, label: 'BR' },
      { x: margin, y: height - margin, label: 'BL' }
    ]);
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!imageRef.current || !corners) return;

    canvas.width = imageRef.current.width;
    canvas.height = imageRef.current.height;

    // Draw original image
    ctx.drawImage(imageRef.current, 0, 0);

    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Cut out paper area to show original image
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    corners.forEach(corner => ctx.lineTo(corner.x, corner.y));
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    //Redraw the paper area 
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    corners.forEach(corner => ctx.lineTo(corner.x, corner.y));
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(imageRef.current, 0, 0); 
    ctx.restore();
    // Draw border
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    corners.forEach(corner => ctx.lineTo(corner.x, corner.y));
    ctx.closePath();
    ctx.stroke();

    // Draw corner handles
    corners.forEach((corner) => {
      // Outer white circle
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 20, 0, 2 * Math.PI);
      ctx.fill();
      
      // Inner blue circle
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 15, 0, 2 * Math.PI);
      ctx.fill();
      
      // Label
      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(corner.label, corner.x, corner.y);
    });
  };

  const cropImage = () => {
    if (!imageRef.current || !corners) return null;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Find bounding box
    const xs = corners.map(c => c.x);
    const ys = corners.map(c => c.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    canvas.width = width;
    canvas.height = height;
    
    // Create clipping path
    ctx.beginPath();
    ctx.moveTo(corners[0].x - minX, corners[0].y - minY);
    corners.forEach(corner => {
      ctx.lineTo(corner.x - minX, corner.y - minY);
    });
    ctx.closePath();
    ctx.clip();
    
    // Draw cropped image
    ctx.drawImage(
      imageRef.current,
      minX, minY, width, height,
      0, 0, width, height
    );
    
    return canvas.toDataURL('image/jpeg', 0.9);
  };

  const getCanvasPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const clientX = e.clientX || (e.touches && e.touches[0]?.clientX);
    const clientY = e.clientY || (e.touches && e.touches[0]?.clientY);
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const handleMouseDown = (e) => {
    if (!corners) return;
    const point = getCanvasPoint(e);
    
    const cornerIndex = corners.findIndex(corner => {
      const dx = corner.x - point.x;
      const dy = corner.y - point.y;
      return Math.sqrt(dx * dx + dy * dy) < 30;
    });
    
    if (cornerIndex !== -1) {
      setDraggingCorner(cornerIndex);
    }
  };

  const handleMouseMove = (e) => {
    if (draggingCorner === null) return;
    const point = getCanvasPoint(e);
    
    setCorners(prev => {
      const newCorners = [...prev];
      newCorners[draggingCorner] = {
        ...newCorners[draggingCorner],
        x: Math.max(0, Math.min(imageRef.current.width, point.x)),
        y: Math.max(0, Math.min(imageRef.current.height, point.y))
      };
      return newCorners;
    });
  };

  const handleMouseUp = () => {
    setDraggingCorner(null);
  };

  const resetCorners = () => {
    if (imageRef.current) {
      detectCorners(imageRef.current);
    }
  };

  const handleConfirm = () => {
    const croppedImage = cropImage();
    onConfirm(croppedImage, corners);
  };

  return (
    <div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
        <p className="text-sm text-blue-900 text-center font-medium">
          📍 Drag blue circles to adjust corners, then click "Use This Scan"
        </p>
      </div>

      <div className="relative bg-gray-100 rounded-lg overflow-auto" style={{ maxHeight: '60vh' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={(e) => {
            e.preventDefault();
            handleMouseDown(e.touches[0]);
          }}
          onTouchMove={(e) => {
            e.preventDefault();
            handleMouseMove(e.touches[0]);
          }}
          onTouchEnd={handleMouseUp}
          className="cursor-move touch-none max-w-full h-auto block mx-auto"
        />
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex gap-3">
          <button
            onClick={resetCorners}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300"
          >
            <RotateCcw className="w-5 h-5" />
            Reset Corners
          </button>
          <button
            onClick={onCancel}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600"
          >
            <X className="w-5 h-5" />
            Cancel
          </button>
        </div>
        
        <button
          onClick={handleConfirm}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-bold text-lg hover:from-green-600 hover:to-green-700 shadow-lg"
        >
          <Check className="w-6 h-6" />
          Use This Scan
        </button>
      </div>
    </div>
  );
}