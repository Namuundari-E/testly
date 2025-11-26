'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { CheckCircle, XCircle, Clock, ArrowLeft, TrendingUp } from 'lucide-react';

export default function StudentResultsPage() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubmissions();
  }, []);

  const loadSubmissions = async () => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');
      
      const token = await user.getIdToken();

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/students/submissions`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      const data = await response.json();
      setSubmissions(data);
    } catch (error) {
      alert('Error loading results: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'graded':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            Graded
          </span>
        );
      case 'pending':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
            <Clock className="w-4 h-4" />
            Pending
          </span>
        );
      default:
        return null;
    }
  };

  const getScoreColor = (percentage) => {
    if (percentage >= 80) return 'text-green-600';
    if (percentage >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your results...</p>
        </div>
      </div>
    );
  }

  const gradedSubmissions = submissions.filter(s => s.status === 'graded');
  const averageScore = gradedSubmissions.length > 0
    ? gradedSubmissions.reduce((sum, s) => sum + (s.percentage || 0), 0) / gradedSubmissions.length
    : 0;

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

        {/* Summary Stats */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-xl p-8 text-white mb-6">
          <h1 className="text-3xl font-bold mb-6">My Results</h1>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <p className="text-indigo-100 text-sm mb-1">Total Exams</p>
              <p className="text-4xl font-bold">{submissions.length}</p>
            </div>
            <div>
              <p className="text-indigo-100 text-sm mb-1">Graded</p>
              <p className="text-4xl font-bold">{gradedSubmissions.length}</p>
            </div>
            <div>
              <p className="text-indigo-100 text-sm mb-1">Average Score</p>
              <p className="text-4xl font-bold">
                {averageScore.toFixed(0)}%
              </p>
            </div>
          </div>
        </div>

        {/* Submissions List */}
        <div className="space-y-4">
          {submissions.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
              <TrendingUp className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <h2 className="text-2xl font-bold text-gray-800 mb-2">No submissions yet</h2>
              <p className="text-gray-600 mb-6">Join an exam to see your results here</p>
              <button
                onClick={() => router.push('/student')}
                className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700"
              >
                Join Exam
              </button>
            </div>
          ) : (
            submissions.map((submission) => (
              <div
                key={submission.id}
                className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition cursor-pointer"
                onClick={() => router.push(`/student/result/${submission.id}`)}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-gray-800">
                      {submission.exam_title}
                    </h2>
                    <p className="text-gray-600 mt-1">
                      Submitted: {new Date(submission.submitted_at).toLocaleString()}
                    </p>
                  </div>
                  {getStatusBadge(submission.status)}
                </div>

                {submission.status === 'graded' ? (
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600">Your Score</p>
                      <p className="text-3xl font-bold text-gray-800">
                        {submission.score?.toFixed(1)}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600">Total Points</p>
                      <p className="text-3xl font-bold text-gray-800">
                        {submission.total_points}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600">Percentage</p>
                      <p className={`text-3xl font-bold ${getScoreColor(submission.percentage)}`}>
                        {submission.percentage?.toFixed(0)}%
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-yellow-50 rounded-lg p-4 text-center">
                    <Clock className="w-8 h-8 mx-auto mb-2 text-yellow-600" />
                    <p className="text-yellow-800 font-medium">
                      Your submission is being reviewed by the teacher
                    </p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}