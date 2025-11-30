'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Users, LogOut } from 'lucide-react';
import { join } from 'path';

export default function StudentDashboard() {
  const [user, setUser] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/');
      } else {
        setUser(user);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleJoinExam = async (e) => {
    e.preventDefault();
    if (!joinCode) return;

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not logged in');
      
      const token = await user.getIdToken();
            console.log(`token:${token}`);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/exams/join?exam_code=${joinCode}`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!response.ok) throw new Error('Invalid exam code');

      const data = await response.json();
      router.push(`/exam/${data.exam_id}?exam_code=${joinCode}`);
    } catch (error) {
      alert('Failed to join exam: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-xl font-bold">Student Dashboard</h1>
              <p className="text-sm text-gray-600">{user?.email}</p>
            </div>
          </div>
          <div className="flex gap-3">
          <button
            onClick={router.push.bind(null, '/student/results')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            <LogOut className="w-4 h-4" />
            View Results
          </button>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-2xl font-bold mb-4">Join Exam</h2>
          <form onSubmit={handleJoinExam} className="flex gap-3">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="flex-1 px-4 py-2 border rounded-lg text-lg font-mono"
              placeholder="Enter exam code"
              maxLength="6"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400"
            >
              {loading ? 'Joining...' : 'Join'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}