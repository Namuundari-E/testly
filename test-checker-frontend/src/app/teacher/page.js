'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { MapPin,BookOpen, LogOut, Plus, Eye } from 'lucide-react';

export default function TeacherDashboard() {
  const [user, setUser] = useState(null);
  const [exams, setExams] = useState([]); // ← Initialize as empty array!
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
        loadExams(user);
      } else {
        router.push('/');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const loadExams = async (user) => {
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/exams/my-exams`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        console.error('Failed to fetch exams');
        return;
      }
      
      const data = await response.json();
      setExams(data.exams || []); // ← Fallback to empty array
    } catch (error) {
      console.error('Failed to load exams:', error);
      setExams([]); // ← Set empty array on error
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-xl font-bold">Teacher Dashboard</h1>
              <p className="text-sm text-gray-600">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">My Exams</h2>
          <button
            onClick={() => router.push('/teacher/create-exam')}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-5 h-5" />
            Create New Exam
          </button>
        </div>

        <div className="grid gap-4">
          {exams.map((exam) => (
            <div key={exam.exam_id} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold">{exam.title}</h2>
                  <p className="text-gray-600">{exam.description}</p>
                  <div className="flex gap-4 mt-2 text-sm">
                    <span>Code: <strong>{exam.exam_code}</strong></span>
                    <span>Questions: {exam.questions?.length || 0}</span>
                    <span>Points: {exam.total_points}</span>
                  </div>
                  {exam.omr_config?.regions && (
                    <span className="inline-block mt-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                      ✓ Regions Marked
                    </span>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/teacher/tool?exam_code=${exam.exam_code}`)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                      exam.omr_config?.regions 
                        ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                        : 'bg-orange-500 text-white hover:bg-orange-600'
                    }`}
                  >
                    <MapPin className="w-4 h-4" />
                    {exam.omr_config?.regions ? 'Edit Regions' : 'Mark Regions'}
                  </button>
                  
                  <button
                    onClick={() => router.push(`/teacher/exam/${exam.exam_code}/submissions`)}
                    className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    <Eye className="w-4 h-4" />
                    View Submissions
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}