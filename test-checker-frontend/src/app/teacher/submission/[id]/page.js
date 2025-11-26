'use client'

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { ArrowLeft, Zap, Save, Image as ImageIcon, Loader2 } from 'lucide-react';

export default function SubmissionReviewPage() {
  const router = useRouter();
  const params = useParams();
  const submissionId = params.id;

  const [submission, setSubmission] = useState(null);
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);
  const [manualScores, setManualScores] = useState({});

  useEffect(() => {
    loadSubmission();
  }, []);

  const loadSubmission = async () => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');
      
      const token = await user.getIdToken();

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/submissions/${submissionId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      const data = await response.json();
      setSubmission(data);

      // Load exam details
      const examResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/exams/${data.exam_id}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      const examData = await examResponse.json();
      setExam(examData);

      // Initialize manual scores if already graded
      if (data.results) {
        const scores = {};
        data.results.forEach(r => {
          scores[r.question_id] = r.score;
        });
        setManualScores(scores);
      }
    } catch (error) {
      alert('Error loading submission: ' + error.message);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleAutoGrade = async () => {
    if (!confirm('Auto-grade this submission with OCR/OMR?')) return;

    setGrading(true);
    try {
      const user = auth.currentUser;
      const token = await user.getIdToken();

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/exams/check_test`,
        {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            submission_id: submissionId,
            exam_id: submission.exam_id 
          })
        }
      );

      if (!response.ok) throw new Error('Failed to grade submission');

      alert('Submission graded successfully!');
      loadSubmission();
    } catch (error) {
      alert('Error grading submission: ' + error.message);
    } finally {
      setGrading(false);
    }
  };

  const handleManualScoreChange = (questionId, score) => {
    setManualScores(prev => ({
      ...prev,
      [questionId]: parseFloat(score) || 0
    }));
  };

  const handleSaveManualGrade = async () => {
    try {
      const user = auth.currentUser;
      const token = await user.getIdToken();

      const totalScore = Object.values(manualScores).reduce((sum, score) => sum + score, 0);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/submissions/${submissionId}`,
        {
          method: 'PATCH',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            scores: manualScores,
            total_score: totalScore,
            status: 'graded'
          })
        }
      );

      if (!response.ok) throw new Error('Failed to save grades');

      alert('Manual grades saved successfully!');
      loadSubmission();
    } catch (error) {
      alert('Error saving grades: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
      </div>
    );
  }

  const totalManualScore = Object.values(manualScores).reduce((sum, score) => sum + score, 0);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="container mx-auto max-w-6xl">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Submissions
        </button>

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">{exam?.title}</h1>
              <p className="text-lg text-gray-600 mt-2">
                Student: {submission.student_name || submission.student_email}
              </p>
              <p className="text-sm text-gray-500">
                Submitted: {new Date(submission.submitted_at).toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <div className={`inline-block px-4 py-2 rounded-lg ${
                submission.status === 'graded' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {submission.status.charAt(0).toUpperCase() + submission.status.slice(1)}
              </div>
              {submission.status === 'graded' && (
                <div className="mt-4">
                  <p className="text-sm text-gray-600">Score</p>
                  <p className="text-4xl font-bold text-indigo-600">
                    {submission.score?.toFixed(1)} / {exam?.total_points}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={handleAutoGrade}
              disabled={grading}
              className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400"
            >
              {grading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
              {grading ? 'Grading...' : 'Auto-Grade with OCR/OMR'}
            </button>
            <button
              onClick={handleSaveManualGrade}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700"
            >
              <Save className="w-5 h-5" />
              Save Manual Grade
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Answer Sheet Image */}
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <ImageIcon className="w-6 h-6" />
              Answer Sheet
            </h2>
            <img
              src={submission.image_url}
              alt="Student answer sheet"
              className="w-full rounded-lg border-2 border-gray-200"
            />
          </div>

          {/* Manual Grading Interface */}
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              Manual Grading
            </h2>

            <div className="space-y-4 mb-6">
              {exam?.questions?.map((question, index) => (
                <div key={question.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800">
                        Question {index + 1}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Type: {question.type === 'mcq' ? 'Multiple Choice' : 'Written'}
                      </p>
                      <p className="text-sm text-gray-600">
                        Correct Answer: {question.correct_answer}
                      </p>
                    </div>
                    <div className="w-24">
                      <input
                        type="number"
                        min="0"
                        max={question.points}
                        step="0.5"
                        value={manualScores[question.id] || 0}
                        onChange={(e) => handleManualScoreChange(question.id, e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-center font-semibold"
                      />
                      <p className="text-xs text-gray-500 text-center mt-1">
                        / {question.points}
                      </p>
                    </div>
                  </div>

                  {submission.results?.find(r => r.question_id === question.id) && (
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-sm text-gray-600">
                        Detected Answer: <span className="font-semibold">
                          {submission.results.find(r => r.question_id === question.id).student_answer || 'N/A'}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between items-center text-xl font-bold">
                <span>Total Score:</span>
                <span className="text-indigo-600">
                  {totalManualScore.toFixed(1)} / {exam?.total_points}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Auto-Graded Results (if available) */}
        {submission.results && submission.results.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-8 mt-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              Auto-Graded Results
            </h2>
            <div className="space-y-3">
              {submission.results.map((result, index) => (
                <div
                  key={index}
                  className={`rounded-lg p-4 border-2 ${
                    result.score === result.max_points
                      ? 'bg-green-50 border-green-300'
                      : result.score > 0
                      ? 'bg-yellow-50 border-yellow-300'
                      : 'bg-red-50 border-red-300'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-800">
                        Question {result.question_id}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Student Answer: <span className="font-semibold">{result.student_answer || 'N/A'}</span>
                      </p>
                      <p className="text-sm text-gray-600">
                        Correct Answer: <span className="font-semibold">{result.correct_answer}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">
                        {result.score.toFixed(1)} / {result.max_points}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}