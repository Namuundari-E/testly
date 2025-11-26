'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { FileSearchCorner } from 'lucide-react';
import { BackgroundGradient } from "@/components/ui/background-gradient";

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      
      // Redirect based on role
      if (role === 'teacher') {
        router.push('/teacher');
      } else {
        router.push('/student');
      }
    } catch (error) {
      alert('Sign in failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setLoading(true);
    
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      
      if (role === 'teacher') {
        router.push('/teacher');
      } else {
        router.push('/student');
      }
    } catch (error) {
      alert('Sign up failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle,rgba(255,255,255,1)_0%,rgba(232,252,255,1)_57%,rgba(171,205,255,0.87)_100%)] flex items-center justify-center p-4">
      <BackgroundGradient className="rounded-[22px] p-8 bg-white ">
        <div className="text-center mb-8 w-90 pt-4 flex flex-col items-center">
          <FileSearchCorner className="w-16 h-16 mx-auto text-blue-600 mb-4" />
          <h1 className="text-4xl font-bold text-gray-800">Testly</h1>
          <p className="text-gray-600 w-2xs">Хиймэл оюун ухаанд суурилсан  шалгалтын систем</p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              I am a:
            </label>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setRole('student')}
                className={`flex-1 py-2 rounded-lg border-2 transition ${
                  role === 'student'
                    ? 'border-blue-600 bg-blue-50 text-blue-600'
                    : 'border-gray-300'
                }`}
              >
                Student
              </button>
              <button
                type="button"
                onClick={() => setRole('teacher')}
                className={`flex-1 py-2 rounded-lg border-2 transition ${
                  role === 'teacher'
                    ? 'border-blue-600 bg-blue-50 text-blue-600'
                    : 'border-gray-300'
                }`}
              >
                Teacher
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <button
            type="button"
            onClick={handleSignUp}
            disabled={loading}
            className="w-full bg-white text-indigo-600 py-3 rounded-lg font-semibold border-2 border-indigo-600 hover:bg-indigo-50"
          >
            Create Account
          </button>
        </form>
      
      </BackgroundGradient>
    </div>
  );
}