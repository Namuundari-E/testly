'use client'

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Camera, Upload, Loader2, CheckCircle, ArrowLeft } from 'lucide-react';
import {auth} from '@/lib/firebase';
import { useSearchParams } from 'next/navigation';
export default function TakeExamPage() {
  const router = useRouter();
  const params = useParams();
  const SearchParams = useSearchParams();
  const examCode = SearchParams.get('exam_code');

  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [testImage, setTestImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    loadExam();
  }, []);

  const loadExam = async () => {
    try {
      const user = auth.currentUser;
      if(!user) throw new Error('User not logged in');
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

  const handleImageUpload = async (e) => {
  const file = e.target.files[0];
  if (file) {
    setTestImage(file);
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
    
    // Optional: Call backend to validate paper detection
    await validatePaperDetection(file);
  }
};

const validatePaperDetection = async (file) => {
  try {
    const formData = new FormData();
    formData.append('image', file);
    
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/validate-paper`,
      {
        method: 'POST',
        body: formData
      }
    );
    
    const data = await response.json();
    
    if (data.detected) {
      // Show success indicator
      console.log('Paper detected successfully');
    } else {
      // Warn user
      alert('Paper not detected clearly. Please retake the photo with better lighting and angle.');
    }
  } catch (error) {
    console.error('Validation error:', error);
  }
};

// Enhanced submit with paper detection
const handleSubmit = async () => {
  if (!testImage) {
    alert('Please upload your answer sheet first');
    return;
  }

  setSubmitting(true);

  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not logged in');

    const token = await user.getIdToken();
    const formData = new FormData();
    formData.append('test_image', testImage);
    formData.append('exam_id', exam.exam_id);

    // Submit to backend - backend will handle paper detection and cropping
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
    
    if (!data.paper_detected) {
      alert('Warning: Paper was not clearly detected. Your submission may need manual review.');
    }
    
    setResult(data);
  } catch (error) {
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

  // Results View
  if (result) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="container mx-auto max-w-4xl">
          <button
            onClick={() => router.push('/student')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </button>

          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-xl p-8 text-white mb-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle className="w-12 h-12" />
              <h2 className="text-3xl font-bold">Exam Submitted!</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <p className="text-indigo-100 mb-1">Your Score</p>
                <p className="text-5xl font-bold">
                  {result.total_score.toFixed(1)} / {result.max_score}
                </p>
              </div>
              <div className="text-right">
                <p className="text-indigo-100 mb-1">Percentage</p>
                <p className="text-5xl font-bold">
                  {result.percentage.toFixed(0)}%
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h3 className="text-2xl font-bold text-gray-800 mb-6">
              Detailed Results
            </h3>
            <div className="space-y-4">
              {result.results.map((item, index) => (
                <div
                  key={index}
                  className={`rounded-lg p-4 border-2 ${
                    item.score === item.max_points
                      ? 'bg-green-50 border-green-300'
                      : item.score > 0
                      ? 'bg-yellow-50 border-yellow-300'
                      : 'bg-red-50 border-red-300'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-gray-800">
                      Question {item.question_id}
                      <span className="ml-2 text-sm font-normal text-gray-600">
                        ({item.type === 'mcq' ? 'Multiple Choice' : 'Written'})
                      </span>
                    </h4>
                    <span className="font-bold text-lg">
                      {item.score.toFixed(1)} / {item.max_points}
                    </span>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600 font-medium">Your Answer:</p>
                      <p className="text-gray-800 font-semibold">
                        {item.student_answer || 'No answer'}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium">Correct Answer:</p>
                      <p className="text-gray-800 font-semibold">
                        {item.correct_answer}
                      </p>
                    </div>
                  </div>
                  {item.similarity !== undefined && (
                    <p className="text-xs text-gray-600 mt-2">
                      Similarity: {(item.similarity * 100).toFixed(0)}%
                    </p>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => router.push('/student')}
              className="w-full mt-6 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Take Exam View
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="container mx-auto max-w-4xl">
        <button
          onClick={() => router.push('/student')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </button>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            {exam?.title}
          </h1>
          <p className="text-gray-600 mb-6">{exam?.description}</p>

          <div className="bg-indigo-50 rounded-lg p-4 mb-6">
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Duration</p>
                <p className="font-semibold text-lg">
                  {exam?.duration_minutes} minutes
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

          <div className="border-t pt-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              Upload Your Answer Sheet
            </h2>

            {!imagePreview ? (
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
                  className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-indigo-300 rounded-lg hover:border-indigo-500 cursor-pointer transition"
                >
                  <Camera className="w-12 h-12 text-indigo-600 mb-3" />
                  <p className="text-lg font-semibold text-gray-800">
                    Take Photo with Camera
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
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
                  className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-green-300 rounded-lg hover:border-green-500 cursor-pointer transition"
                >
                  <Upload className="w-12 h-12 text-green-600 mb-3" />
                  <p className="text-lg font-semibold text-gray-800">
                    Upload from Gallery
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Choose an existing photo
                  </p>
                </label>
              </div>
            ) : (
              <div>
                <img
                  src={imagePreview}
                  alt="Answer sheet preview"
                  className="max-w-full h-auto rounded-lg shadow-md mb-4"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setTestImage(null);
                      setImagePreview(null);
                    }}
                    className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-300"
                  >
                    Choose Different Image
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {submitting ? 'Submitting...' : 'Submit Exam'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}