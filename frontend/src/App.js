import React, { useState, useEffect } from 'react';
import { Upload, CheckCircle, XCircle, Loader2, FileText, Camera, LogOut, Users, BookOpen, Plus, Eye } from 'lucide-react';
import { auth } from './firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut as firebaseSignOut 
} from 'firebase/auth';

export default function TestCheckerApp() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('login');
  
  // Auth states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  
  // Teacher states
  const [exams, setExams] = useState([]);
  const [newExam, setNewExam] = useState({
    title: '',
    description: '',
    duration_minutes: 30,
    questions: []
  });
  const [examCode, setExamCode] = useState('');
  
  // Student states
  const [joinCode, setJoinCode] = useState('');
  const [currentExam, setCurrentExam] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [testImage, setTestImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [result, setResult] = useState(null);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  // Simulate Firebase Auth (replace with actual Firebase SDK)
const signUp = async (email, password) => {
  setLoading(true);
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const idToken = await userCredential.user.getIdToken();
    
    setUser({ email, role, token: idToken, uid: userCredential.user.uid });
    setView(role === 'teacher' ? 'teacher-dashboard' : 'student-dashboard');
  } catch (error) {
    alert('Sign up failed: ' + error.message);
  } finally {
    setLoading(false);
  }
};

  const signIn = async (email, password) => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await userCredential.user.getIdToken();
      
      setUser({ email, role, token: idToken, uid: userCredential.user.uid });
      setView(role === 'teacher' ? 'teacher-dashboard' : 'student-dashboard');
    } catch (error) {
      alert('Sign in failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Replace signOut with:
  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setView('login');
  };

  // Teacher functions
  const createExam = async () => {
    if (!newExam.title || newExam.questions.length === 0) {
      alert('Please add title and questions');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/exams/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify(newExam)
      });

      const data = await response.json();
      setExamCode(data.exam_code);
      alert(`Exam created! Code: ${data.exam_code}`);
      loadMyExams();
      setView('teacher-dashboard');
    } catch (error) {
      alert('Failed to create exam: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMyExams = async () => {
    try {
      const response = await fetch(`${API_URL}/api/exams/my-exams`, {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      const data = await response.json();
      setExams(data.exams);
    } catch (error) {
      console.error('Failed to load exams:', error);
    }
  };

  const addQuestion = () => {
    setNewExam({
      ...newExam,
      questions: [
        ...newExam.questions,
        {
          question_id: `${newExam.questions.length + 1}`,
          question_text: '',
          type: 'mcq',
          options: ['A', 'B', 'C'],
          correct_answer: 'A',
          points: 1
        }
      ]
    });
  };

  const updateQuestion = (index, field, value) => {
    const updated = [...newExam.questions];
    updated[index][field] = value;
    setNewExam({ ...newExam, questions: updated });
  };

  // Student functions
  const joinExam = async () => {
    if (!joinCode) {
      alert('Please enter exam code');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/exams/join?exam_code=${joinCode}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${user.token}` }
      });

      if (!response.ok) throw new Error('Invalid exam code');

      const data = await response.json();
      setCurrentExam(data);
      setView('take-exam');
    } catch (error) {
      alert('Failed to join exam: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const submitExam = async () => {
    if (!testImage) {
      alert('Please upload your answer sheet');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('test_image', testImage);

      const response = await fetch(`${API_URL}/api/exams/submit?exam_id=${currentExam.exam_id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${user.token}` },
        body: formData
      });

      const data = await response.json();
      setResult(data);
      setView('results');
    } catch (error) {
      alert('Failed to submit exam: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setTestImage(file);
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (user && user.role === 'teacher' && view === 'teacher-dashboard') {
      loadMyExams();
    }
  }, [user, view]);

  // Login/Signup View
  if (view === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <FileText className="w-16 h-16 mx-auto text-indigo-600 mb-4" />
            <h1 className="text-3xl font-bold text-gray-800">Test Checker</h1>
            <p className="text-gray-600">AI-powered exam grading system</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">I am a:</label>
              <div className="flex gap-4">
                <button
                  onClick={() => setRole('student')}
                  className={`flex-1 py-2 rounded-lg border-2 transition ${
                    role === 'student'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                      : 'border-gray-300'
                  }`}
                >
                  Student
                </button>
                <button
                  onClick={() => setRole('teacher')}
                  className={`flex-1 py-2 rounded-lg border-2 transition ${
                    role === 'teacher'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                      : 'border-gray-300'
                  }`}
                >
                  Teacher
                </button>
              </div>
            </div>

            <button
              onClick={() => signIn(email, password)}
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:bg-gray-400"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <button
              onClick={() => signUp(email, password)}
              disabled={loading}
              className="w-full bg-white text-indigo-600 py-3 rounded-lg font-semibold border-2 border-indigo-600 hover:bg-indigo-50 transition"
            >
              Create Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Teacher Dashboard
  if (view === 'teacher-dashboard') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white shadow">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-indigo-600" />
              <div>
                <h1 className="text-xl font-bold">Teacher Dashboard</h1>
                <p className="text-sm text-gray-600">{user.email}</p>
              </div>
            </div>
            <button
              onClick={signOut}
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
              onClick={() => setView('create-exam')}
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
                    <h3 className="text-xl font-bold">{exam.title}</h3>
                    <p className="text-gray-600">{exam.description}</p>
                    <div className="mt-2 flex gap-4 text-sm text-gray-500">
                      <span>Code: <strong>{exam.exam_code}</strong></span>
                      <span>{exam.questions.length} questions</span>
                      <span>{exam.duration_minutes} minutes</span>
                    </div>
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50">
                    <Eye className="w-4 h-4" />
                    View Results
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Create Exam View
  if (view === 'create-exam') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setView('teacher-dashboard')}
            className="mb-4 text-indigo-600 hover:underline"
          >
            ← Back to Dashboard
          </button>

          <div className="bg-white rounded-lg shadow p-8">
            <h2 className="text-2xl font-bold mb-6">Create New Exam</h2>

            <div className="space-y-4">
              <div>
                <label className="block font-medium mb-1">Exam Title</label>
                <input
                  type="text"
                  value={newExam.title}
                  onChange={(e) => setNewExam({ ...newExam, title: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                  placeholder="e.g., English Grammar Test"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Description</label>
                <textarea
                  value={newExam.description}
                  onChange={(e) => setNewExam({ ...newExam, description: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                  rows="2"
                  placeholder="Brief description..."
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  value={newExam.duration_minutes}
                  onChange={(e) => setNewExam({ ...newExam, duration_minutes: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-lg">Questions</h3>
                  <button
                    onClick={addQuestion}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                  >
                    + Add Question
                  </button>
                </div>

                {newExam.questions.map((q, i) => (
                  <div key={i} className="bg-gray-50 p-4 rounded-lg mb-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1">Question {i + 1}</label>
                        <input
                          type="text"
                          value={q.question_text}
                          onChange={(e) => updateQuestion(i, 'question_text', e.target.value)}
                          className="w-full px-3 py-2 border rounded"
                          placeholder="Enter question..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Correct Answer</label>
                        <input
                          type="text"
                          value={q.correct_answer}
                          onChange={(e) => updateQuestion(i, 'correct_answer', e.target.value)}
                          className="w-full px-3 py-2 border rounded"
                          placeholder="A, B, C..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Points</label>
                        <input
                          type="number"
                          value={q.points}
                          onChange={(e) => updateQuestion(i, 'points', parseFloat(e.target.value))}
                          className="w-full px-3 py-2 border rounded"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={createExam}
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400"
              >
                {loading ? 'Creating...' : 'Create Exam'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Student Dashboard
  if (view === 'student-dashboard') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white shadow">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-indigo-600" />
              <div>
                <h1 className="text-xl font-bold">Student Dashboard</h1>
                <p className="text-sm text-gray-600">{user.email}</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="bg-white rounded-lg shadow p-8 mb-6">
            <h2 className="text-2xl font-bold mb-4">Join Exam</h2>
            <div className="flex gap-3">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="flex-1 px-4 py-2 border rounded-lg text-lg font-mono"
                placeholder="Enter exam code"
                maxLength="6"
              />
              <button
                onClick={joinExam}
                disabled={loading}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400"
              >
                {loading ? 'Joining...' : 'Join'}
              </button>
            </div>
          </div>

          <h2 className="text-2xl font-bold mb-4">My Submissions</h2>
          {submissions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No submissions yet</p>
          ) : (
            <div className="space-y-3">
              {submissions.map((sub) => (
                <div key={sub.submission_id} className="bg-white rounded-lg shadow p-6">
                  <h3 className="font-bold">{sub.exam_title}</h3>
                  <p className="text-2xl font-bold text-indigo-600">
                    {sub.percentage.toFixed(0)}% ({sub.total_score}/{sub.max_score})
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Take Exam View
  if (view === 'take-exam' && currentExam) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow p-8">
            <h2 className="text-2xl font-bold mb-2">{currentExam.title}</h2>
            <p className="text-gray-600 mb-6">{currentExam.description}</p>

            <div className="bg-indigo-50 p-4 rounded-lg mb-6">
              <p><strong>Duration:</strong> {currentExam.duration_minutes} minutes</p>
              <p><strong>Total Points:</strong> {currentExam.total_points}</p>
              <p><strong>Questions:</strong> {currentExam.questions.length}</p>
            </div>

            <div className="border-t pt-6">
              <h3 className="font-bold text-lg mb-4">Upload Your Answer Sheet</h3>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="upload"
              />
              <label
                htmlFor="upload"
                className="block border-2 border-dashed border-indigo-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-500"
              >
                <Camera className="w-12 h-12 mx-auto text-indigo-600 mb-2" />
                <p className="text-lg font-semibold">Click to upload answer sheet</p>
              </label>

              {imagePreview && (
                <img src={imagePreview} alt="Preview" className="mt-4 max-h-96 mx-auto rounded-lg shadow" />
              )}

              <button
                onClick={submitExam}
                disabled={!testImage || loading}
                className="w-full mt-6 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400"
              >
                {loading ? 'Submitting...' : 'Submit Exam'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Results View
  if (view === 'results' && result) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow-xl p-8 text-white mb-6">
            <h2 className="text-3xl font-bold mb-4">Exam Submitted!</h2>
            <div className="flex justify-between items-center">
              <div>
                <p className="text-indigo-100 mb-1">Your Score</p>
                <p className="text-5xl font-bold">{result.total_score} / {result.max_score}</p>
              </div>
              <div className="text-right">
                <p className="text-indigo-100 mb-1">Percentage</p>
                <p className="text-5xl font-bold">{result.percentage.toFixed(0)}%</p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setView('student-dashboard')}
            className="mb-4 bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return null;
}