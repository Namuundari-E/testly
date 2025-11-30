'use client'

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Camera, Upload, Loader2, ArrowLeft, Check, RotateCcw } from 'lucide-react';
import { auth } from '@/lib/firebase';
import PaperScanner from '@/components/PaperScanner';

export default function TakeExamPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const examCode = searchParams.get('exam_code');

  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Image states
  const [originalImage, setOriginalImage] = useState(null);
  const [croppedImage, setCroppedImage] = useState(null);
  const [corners, setCorners] = useState(null);
  const [scanMode, setScanMode] = useState(false);

  useEffect(() => {
    loadExam();
  }, []);

  const loadExam = async () => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not logged in');
      
      const token = await user.getIdToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/exams/join?exam_code=${examCode}`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!response.ok) throw new Error('Failed to load exam');

      const data = await response.json();
      setExam(data);
    } catch (error) {
      alert('Error loading exam: ' + error.message);
      router.push('/student');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setOriginalImage(e.target.result);
        setScanMode(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleScanConfirm = (croppedImg, cornerData) => {
    setCroppedImage(croppedImg);
    setCorners(cornerData);
    setScanMode(false);
  };

  const handleScanCancel = () => {
    setOriginalImage(null);
    setScanMode(false);
  };

  const handleRescan = () => {
    setOriginalImage(null);
    setCroppedImage(null);
    setCorners(null);
    setScanMode(false);
  };

  const dataURLtoBlob = (dataurl) => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  const handleSubmit = async () => {
    if (!croppedImage) {
      alert('Please upload and scan your answer sheet first');
      return;
    }

    if (!confirm('Submit this exam? You cannot change your answer after submission.')) {
      return;
    }

    setSubmitting(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not logged in');

      const token = await user.getIdToken();
      const formData = new FormData();
      
      // Convert cropped image to blob and append
      formData.append('test_image', dataURLtoBlob(croppedImage), 'exam_answer.jpg');
      formData.append('exam_code', examCode);
      formData.append('corners', JSON.stringify(corners));

      console.log('Submitting exam with code:', examCode);
      console.log('Corners:', corners);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/exams/submit`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to submit exam');
      }

      const data = await response.json();
      console.log('Submission response:', data);
      
      setSubmitted(true);
      
      // Redirect to results after 2 seconds
      setTimeout(() => {
        router.push('/student/results');
      }, 2000);
      
    } catch (error) {
      console.error('Submission error:', error);
      alert('Error submitting exam: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-xl p-12 text-center max-w-md">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mb-3">Submitted Successfully!</h2>
          <p className="text-gray-600 mb-6">
            Your exam has been submitted. Your teacher will grade it soon.
          </p>
          <p className="text-sm text-gray-500">Redirecting to results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="container mx-auto max-w-4xl">
        <button
          onClick={() => router.push('/student')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </button>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
            <h1 className="text-2xl md:text-3xl font-bold mb-2">
              {exam?.title}
            </h1>
            <p className="text-indigo-100">{exam?.description}</p>
          </div>

          {/* Exam Info */}
          <div className="bg-indigo-50 p-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Duration</p>
                <p className="font-semibold text-lg">
                  {exam?.duration_minutes} min
                </p>
              </div>
              <div>
                <p className="text-gray-600">Total Points</p>
                <p className="font-semibold text-lg">{exam?.total_points}</p>
              </div>
              <div>
                <p className="text-gray-600">Questions</p>
                <p className="font-semibold text-lg">
                  {exam?.questions?.length}
                </p>
              </div>
            </div>
          </div>

          {/* Upload/Scanner Section */}
          <div className="p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              📸 Upload Your Answer Sheet
            </h2>

            {!originalImage && !croppedImage ? (
              // Upload Options
              <div className="space-y-4">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="camera-input"
                />
                <label
                  htmlFor="camera-input"
                  className="flex flex-col items-center justify-center p-6 md:p-8 border-2 border-dashed border-indigo-300 rounded-lg hover:border-indigo-500 cursor-pointer transition bg-indigo-50 hover:bg-indigo-100"
                >
                  <Camera className="w-12 h-12 text-indigo-600 mb-3" />
                  <p className="text-lg font-semibold text-gray-800 text-center">
                    Take Photo with Camera
                  </p>
                  <p className="text-sm text-gray-500 mt-1 text-center">
                    Click to open camera
                  </p>
                </label>

                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="file-input"
                />
                <label
                  htmlFor="file-input"
                  className="flex flex-col items-center justify-center p-6 md:p-8 border-2 border-dashed border-green-300 rounded-lg hover:border-green-500 cursor-pointer transition bg-green-50 hover:bg-green-100"
                >
                  <Upload className="w-12 h-12 text-green-600 mb-3" />
                  <p className="text-lg font-semibold text-gray-800 text-center">
                    Upload from Gallery
                  </p>
                  <p className="text-sm text-gray-500 mt-1 text-center">
                    Choose an existing photo
                  </p>
                </label>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-bold text-blue-900 mb-2">📸 Photo Tips:</h3>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Place paper on a flat, contrasting surface</li>
                    <li>• Ensure good lighting (no shadows)</li>
                    <li>• Capture all 4 corners of the paper</li>
                    <li>• Hold camera parallel to paper</li>
                    <li>• You can adjust corners after capture</li>
                  </ul>
                </div>
              </div>
            ) : scanMode ? (
              // Scanner Mode
              <PaperScanner
                image={originalImage}
                onConfirm={handleScanConfirm}
                onCancel={handleScanCancel}
              />
            ) : (
              // Preview/Submit Mode
              <div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-green-800 text-center font-medium">
                    ✓ Image cropped and ready to submit
                  </p>
                </div>

                <div className="border-2 border-gray-200 rounded-lg overflow-hidden mb-4">
                  <img
                    src={croppedImage}
                    alt="Cropped answer sheet"
                    className="w-full h-auto"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleRescan}
                    className="flex items-center justify-center gap-2 flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-300"
                  >
                    <RotateCcw className="w-5 h-5" />
                    Scan Different Image
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex items-center justify-center gap-2 flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white py-3 rounded-lg font-bold hover:from-green-600 hover:to-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-lg"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Check className="w-5 h-5" />
                        Submit Exam
                      </>
                    )}
                  </button>
                </div>

                <p className="text-xs text-gray-500 text-center mt-3">
                  ⚠️ You cannot change your answer after submission
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}