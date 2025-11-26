'use client'

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { FileText, CheckCircle, Clock, Eye, Zap, Download, ArrowLeft } from 'lucide-react';

export default function ExamSubmissionsPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.id;

  const [exam, setExam] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);

  useEffect(() => {
    loadExamAndSubmissions();
  }, []);

  const loadExamAndSubmissions = async () => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');
      
      const token = await user.getIdToken();

      // Load exam details
      const examResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/exams/${examId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      const examData = await examResponse.json();
      setExam(examData);

      // Load submissions
      console.log(examId);
      console.log(token);
      const submissionsResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/exams/${examId}/submissions`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      const submissionsData = await submissionsResponse.json();
      setSubmissions(Array.isArray(submissionsData) ? submissionsData : []);
    } catch (error) {
      alert('Error loading submissions: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoGradeAll = async () => {
    if (!confirm('Auto-grade all pending submissions?')) return;

    setGrading(true);
    try {
      const user = auth.currentUser;
      const token = await user.getIdToken();

      const pendingSubmissions = submissions?.filter(s => s.status === 'pending') || 0;
      
      for (const submission of pendingSubmissions) {
        await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/exams/check_test`,
          {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              submission_id: submission.id,
              exam_id: examId 
            })
          }
        );
      }

      alert('All submissions graded successfully!');
      loadExamAndSubmissions();
    } catch (error) {
      alert('Error grading submissions: ' + error.message);
    } finally {
      setGrading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'graded': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'reviewing': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'graded': return <CheckCircle className="w-4 h-4" />;
      case 'pending': return <Clock className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading submissions...</p>
        </div>
      </div>
    );
  }

  const pendingCount = submissions?.filter(s => s.status === 'pending').length || 0;
  const gradedCount = submissions?.filter(s => s.status === 'graded').length || 0;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <button
          onClick={() => router.push('/teacher')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </button>

        <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">{exam?.title}</h1>
              <p className="text-gray-600 mt-2">{exam?.description}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Exam Code</p>
              <p className="text-2xl font-bold text-indigo-600">{exam?.exam_code}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Total Submissions</p>
              <p className="text-3xl font-bold text-gray-800">{submissions.length}</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-3xl font-bold text-yellow-600">{pendingCount}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Graded</p>
              <p className="text-3xl font-bold text-green-600">{gradedCount}</p>
            </div>
            <div className="bg-indigo-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Average Score</p>
              <p className="text-3xl font-bold text-indigo-600">
                {gradedCount > 0 
                  ? (submissions?.filter(s => s.status === 'graded') || 0
                      .reduce((sum, s) => sum + (s.score || 0), 0) / gradedCount).toFixed(1)
                  : '-'}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleAutoGradeAll}
              disabled={pendingCount === 0 || grading}
              className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400"
            >
              <Zap className="w-5 h-5" />
              {grading ? 'Grading...' : `Auto-Grade All (${pendingCount})`}
            </button>
            <button
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700"
            >
              <Download className="w-5 h-5" />
              Export Results
            </button>
          </div>
        </div>

        {/* Submissions List */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Student Submissions</h2>
          
          {submissions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No submissions yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {submissions.map((submission) => (
                <div
                  key={submission.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                      <span className="text-lg font-bold text-indigo-600">
                        {submission.student_name?.charAt(0) || 'S'}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800">
                        {submission.student_name || submission.student_email}
                      </h3>
                      <p className="text-sm text-gray-500">
                        Submitted {new Date(submission.submitted_at).toLocaleString()}
                      </p>
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(submission.status)}`}>
                      {getStatusIcon(submission.status)}
                      {submission.status.charAt(0).toUpperCase() + submission.status.slice(1)}
                    </div>
                    {submission.status === 'graded' && (
                      <div className="text-right">
                        <p className="text-2xl font-bold text-gray-800">
                          {submission.score?.toFixed(1) || 0}
                        </p>
                        <p className="text-sm text-gray-500">
                          / {exam?.total_points}
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => router.push(`/teacher/submission/${submission.id}`)}
                    className="ml-4 flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
                  >
                    <Eye className="w-4 h-4" />
                    View
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}