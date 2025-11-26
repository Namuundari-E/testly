'use client'

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { ArrowLeft, CheckCircle, XCircle, Award, TrendingUp } from 'lucide-react';

export default function StudentResultDetailPage() {
  const router = useRouter();
  const params = useParams();
  const submissionId = params.id;

  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubmissionDetail();
  }, []);

  const loadSubmissionDetail = async () => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');
      
      const token = await user.getIdToken();

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/students/submissions/${submissionId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      const data = await response.json();
      setSubmission(data);
    } catch (error) {
      alert('Error loading result: ' + error.message);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const percentage = (submission.score / submission.total_points) * 100;
  const getGrade = (pct) => {
    if (pct >= 90) return { letter: 'A', color: 'text-green-600', bg: 'bg-green-50' };
    if (pct >= 80) return { letter: 'B', color: 'text-blue-600', bg: 'bg-blue-50' };
    if (pct >= 70) return { letter: 'C', color: 'text-yellow-600', bg: 'bg-yellow-50' };
    if (pct >= 60) return { letter: 'D', color: 'text-orange-600', bg: 'bg-orange-50' };
    return { letter: 'F', color: 'text-red-600', bg: 'bg-red-50' };
  };

  const grade = getGrade(percentage);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="container mx-auto max-w-4xl">
        <button
          onClick={() => router.push('/student/results')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Results
        </button>

        {/* Score Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-xl p-8 text-white mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">{submission.exam_title}</h1>
              <p className="text-indigo-100">
                Submitted: {new Date(submission.submitted_at).toLocaleString()}
              </p>
            </div>
            <div className={`${grade.bg} ${grade.color} w-24 h-24 rounded-full flex items-center justify-center`}>
              <span className="text-4xl font-bold">{grade.letter}</span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-6">
            <div>
              <p className="text-indigo-100 text-sm mb-1">Your Score</p>
              <p className="text-4xl font-bold">{submission.score?.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-indigo-100 text-sm mb-1">Total Points</p>
              <p className="text-4xl font-bold">{submission.total_points}</p>
            </div>
            <div>
              <p className="text-indigo-100 text-sm mb-1">Percentage</p>
              <p className="text-4xl font-bold">{percentage.toFixed(0)}%</p>
            </div>
          </div>
        </div>

        {/* Performance Summary */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            Performance Summary
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="text-3xl font-bold text-green-600">
                {submission.results?.filter(r => r.score === r.max_points).length || 0}
              </p>
              <p className="text-sm text-gray-600">Correct</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4 text-center">
              <Award className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
              <p className="text-3xl font-bold text-yellow-600">
                {submission.results?.filter(r => r.score > 0 && r.score < r.max_points).length || 0}
              </p>
              <p className="text-sm text-gray-600">Partial</p>
            </div>
            <div className="bg-red-50 rounded-lg p-4 text-center">
              <XCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
              <p className="text-3xl font-bold text-red-600">
                {submission.results?.filter(r => r.score === 0).length || 0}
              </p>
              <p className="text-sm text-gray-600">Incorrect</p>
            </div>
          </div>
        </div>

        {/* Detailed Results */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Question-by-Question Results</h2>
          
          {submission.results && submission.results.length > 0 ? (
            <div className="space-y-4">
              {submission.results.map((result, index) => (
                <div
                  key={index}
                  className={`rounded-lg p-6 border-2 ${
                    result.score === result.max_points
                      ? 'bg-green-50 border-green-300'
                      : result.score > 0
                      ? 'bg-yellow-50 border-yellow-300'
                      : 'bg-red-50 border-red-300'
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      {result.score === result.max_points ? (
                        <CheckCircle className="w-6 h-6 text-green-600" />
                      ) : result.score > 0 ? (
                        <Award className="w-6 h-6 text-yellow-600" />
                      ) : (
                        <XCircle className="w-6 h-6 text-red-600" />
                      )}
                      <h3 className="text-xl font-bold text-gray-800">
                        Question {result.question_id}
                      </h3>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-800">
                        {result.score.toFixed(1)} / {result.max_points}
                      </p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-white rounded-lg p-4">
                      <p className="text-sm text-gray-600 font-medium mb-2">Your Answer:</p>
                      <p className="text-lg font-semibold text-gray-800">
                        {result.student_answer || 'No answer detected'}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-4">
                      <p className="text-sm text-gray-600 font-medium mb-2">Correct Answer:</p>
                      <p className="text-lg font-semibold text-green-700">
                        {result.correct_answer}
                      </p>
                    </div>
                  </div>

                  {result.similarity !== undefined && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-indigo-600 h-2 rounded-full"
                            style={{ width: `${result.similarity * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-600">
                          {(result.similarity * 100).toFixed(0)}% match
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>No detailed results available yet</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => router.push('/student/results')}
            className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-300"
          >
            Back to All Results
          </button>
          <button
            onClick={() => router.push('/student')}
            className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}