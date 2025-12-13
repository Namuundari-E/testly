'use client'
import React, { useState, useRef, useEffect } from 'react';
import { Upload, Save, Eye, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth } from '@/lib/firebase';

export default function RegionMarkerTool() {
  const [image, setImage] = useState(null);
  const [regions, setRegions] = useState([]);
  const [currentRegion, setCurrentRegion] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [regionType, setRegionType] = useState('mcq'); // 'mcq' or 'written'
  const [mcqRegionMarked, setMcqRegionMarked] = useState(false);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);

  const SearchParams = useSearchParams();
  const router = useRouter();
  const examCode = SearchParams.get('exam_code');

  useEffect(() => {
    if (image && canvasRef.current) {
      drawCanvas();
    }
  }, [image, regions, currentRegion]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          imageRef.current = img;
          setImage(e.target.result);
          setRegions([]);
          setMcqRegionMarked(false);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!imageRef.current) return;

    canvas.width = imageRef.current.width;
    canvas.height = imageRef.current.height;
    ctx.drawImage(imageRef.current, 0, 0);

    // Draw existing regions
    regions.forEach((region) => {
      ctx.strokeStyle = region.type === 'mcq' ? '#3b82f6' : '#10b981';
      ctx.lineWidth = 3;
      ctx.strokeRect(region.x, region.y, region.width, region.height);
      
      // Draw label
      ctx.fillStyle = region.type === 'mcq' ? '#3b82f6' : '#10b981';
      ctx.fillRect(region.x, region.y - 30, 180, 30);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 16px Arial';
      const label = region.type === 'mcq' 
        ? 'MCQ Section (All)' 
        : `Written Q${region.questionId}`;
      ctx.fillText(label, region.x + 5, region.y - 10);
    });

    // Draw current region being drawn
    if (currentRegion) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        currentRegion.x,
        currentRegion.y,
        currentRegion.width,
        currentRegion.height
      );
      ctx.setLineDash([]);
    }
  };

  const handleMouseDown = (e) => {
    if (!image) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setIsDrawing(true);
    setCurrentRegion({ x, y, width: 0, height: 0, type: regionType });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !currentRegion) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const currentX = (e.clientX - rect.left) * scaleX;
    const currentY = (e.clientY - rect.top) * scaleY;

    setCurrentRegion({
      ...currentRegion,
      width: currentX - currentRegion.x,
      height: currentY - currentRegion.y
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentRegion) return;

    if (Math.abs(currentRegion.width) > 10 && Math.abs(currentRegion.height) > 10) {
      // Check if trying to mark MCQ when already marked
      if (currentRegion.type === 'mcq' && mcqRegionMarked) {
        alert('MCQ region already marked! You can only mark ONE MCQ region for all multiple choice questions.');
        setIsDrawing(false);
        setCurrentRegion(null);
        return;
      }

      // Normalize negative dimensions
      const normalized = {
        x: currentRegion.width < 0 ? currentRegion.x + currentRegion.width : currentRegion.x,
        y: currentRegion.height < 0 ? currentRegion.y + currentRegion.height : currentRegion.y,
        width: Math.abs(currentRegion.width),
        height: Math.abs(currentRegion.height),
        type: currentRegion.type,
        questionId: currentRegion.type === 'mcq' ? 'all' : regions.filter(r => r.type === 'written').length + 1
      };

      setRegions([...regions, normalized]);
      
      if (normalized.type === 'mcq') {
        setMcqRegionMarked(true);
        setRegionType('written'); // Auto-switch to written after MCQ
      }
    }

    setIsDrawing(false);
    setCurrentRegion(null);
  };

  const deleteRegion = (index) => {
    const region = regions[index];
    if (region.type === 'mcq') {
      setMcqRegionMarked(false);
    }
    setRegions(regions.filter((_, i) => i !== index));
  };

  const saveRegions = async () => {
    if (regions.length === 0) {
      alert('Please mark at least one region');
      return;
    }

    if (!mcqRegionMarked) {
      alert('Please mark the MCQ region first');
      return;
    }

    const regionData = {
      image_width: imageRef.current.width,
      image_height: imageRef.current.height,
      regions: regions.map(r => ({
        question_id: r.questionId,
        type: r.type,
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height)
      }))
    };

    console.log('Region data to save:', JSON.stringify(regionData, null, 2));
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');
      
      const token = await user.getIdToken();
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/exams/${examCode}/regions`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(regionData)
        }
      );

      if (!response.ok) throw new Error('Failed to save regions');

      alert('Regions saved successfully!');
      router.push('/teacher'); // Go back to dashboard
      
    } catch (error) {
      alert('Error saving regions: ' + error.message);
    }
  };

  const writtenCount = regions.filter(r => r.type === 'written').length;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="container mx-auto max-w-7xl">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Answer Region Marker</h1>
          <p className="text-gray-600 mb-6">Mark ONE region for all MCQ questions, then mark individual regions for written questions</p>
          
          {!image ? (
            <div className="text-center py-12">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="image-upload"
              />
              <label
                htmlFor="image-upload"
                className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg cursor-pointer hover:bg-indigo-700"
              >
                <Upload className="w-5 h-5" />
                Upload Exam Template
              </label>
              <p className="text-gray-500 mt-4">Upload a clear scan/photo of your exam paper</p>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Canvas Area */}
              <div className="lg:col-span-2">
                <div className="bg-gray-100 rounded-lg p-4">
                  <div className="mb-4">
                    <div className="flex gap-3 mb-3">
                      <button
                        onClick={() => setRegionType('mcq')}
                        disabled={mcqRegionMarked}
                        className={`flex-1 py-2 px-4 rounded-lg font-semibold ${
                          regionType === 'mcq' && !mcqRegionMarked
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-600'
                        } ${mcqRegionMarked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500 hover:text-white'}`}
                      >
                        📝 MCQ Region {mcqRegionMarked && '✓'}
                      </button>
                      <button
                        onClick={() => setRegionType('written')}
                        className={`flex-1 py-2 px-4 rounded-lg font-semibold ${
                          regionType === 'written'
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-200 text-gray-600 hover:bg-green-500 hover:text-white'
                        }`}
                      >
                        ✍️ Written Region
                      </button>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Eye className="w-4 h-4" />
                      <p>Currently marking: <span className="font-bold">{regionType === 'mcq' ? 'MCQ Section' : `Written Question ${writtenCount + 1}`}</span></p>
                    </div>
                  </div>
                  <div className="overflow-auto max-h-[600px] border-2 border-gray-300 rounded">
                    <canvas
                      ref={canvasRef}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      className="cursor-crosshair"
                      style={{ maxWidth: '100%', height: 'auto' }}
                    />
                  </div>
                </div>
              </div>

              {/* Controls Panel */}
              <div className="space-y-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="font-bold text-blue-900 mb-2">📋 Instructions</h3>
                  <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                    <li><strong>First:</strong> Mark ONE large region covering ALL MCQ bubbles</li>
                    <li><strong>Then:</strong> Mark each written answer space individually</li>
                    <li>Blue box = MCQ section, Green = Written</li>
                    <li>Click Save when done</li>
                  </ol>
                </div>

                <div className="bg-white border rounded-lg p-4">
                  <h3 className="font-bold text-gray-800 mb-3">Marked Regions ({regions.length})</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {regions.map((region, idx) => (
                      <div key={idx} className={`flex items-center gap-2 p-2 rounded ${
                        region.type === 'mcq' ? 'bg-blue-50' : 'bg-green-50'
                      }`}>
                        <span className="flex-1 font-semibold text-gray-700">
                          {region.type === 'mcq' ? '📝 MCQ Section' : `✍️ Written Q${region.questionId}`}
                        </span>
                        <button
                          onClick={() => deleteRegion(idx)}
                          className="p-1 text-red-600 hover:bg-red-100 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {regions.length === 0 && (
                      <p className="text-gray-500 text-sm text-center py-4">No regions marked yet</p>
                    )}
                  </div>
                </div>

                <button
                  onClick={saveRegions}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700"
                >
                  <Save className="w-5 h-5" />
                  Save Regions
                </button>

                <button
                  onClick={() => {
                    setImage(null);
                    setRegions([]);
                    setMcqRegionMarked(false);
                    setRegionType('mcq');
                  }}
                  className="w-full bg-gray-200 text-gray-800 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300"
                >
                  Upload Different Image
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}