'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
export default function CreateExamPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [examCode, setExamCode] = useState('');
  
  const [exam, setExam] = useState({
    title: '',
    description: '',
    duration_minutes: 30,
    questions: [
      {
        question_id: '1',
        question_text: '',
        type: 'mcq',
        options: ['A', 'B', 'C'],
        correct_answer: 'A',
        points: 1
      }
    ]
  });

  const addQuestion = () => {
    setExam({
      ...exam,
      questions: [
        ...exam.questions,
        {
          question_id: String(exam.questions.length + 1),
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
    const updated = [...exam.questions];
    updated[index][field] = value;
    setExam({ ...exam, questions: updated });
  };

  const removeQuestion = (index) => {
    const updated = exam.questions.filter((_, i) => i !== index);
    // Renumber questions
    updated.forEach((q, i) => {
      q.question_id = String(i + 1);
    });
    setExam({ ...exam, questions: updated });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!exam.title || exam.questions.length === 0) {
      alert('Please add title and at least one question');
      return;
    }

    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not logged in');
      // const token = localStorage.getItem('authToken');
      const token = await user.getIdToken();
            console.log(`token:${token}`);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/exams/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(exam)
      });

      if (!response.ok) throw new Error('Failed to create exam');

      const data = await response.json();
      setExamCode(data.exam_code);
      
      setTimeout(() => {
        router.push('/teacher');
      }, 3000);
    } catch (error) {
      alert('Error creating exam: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (examCode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Save className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Exam Created Successfully!
          </h2>
          <p className="text-gray-600 mb-6">
            Share this code with students:
          </p>
          <div className="bg-indigo-50 border-2 border-indigo-600 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600 mb-1">Exam Code:</p>
            <p className="text-4xl font-bold text-indigo-600 font-mono tracking-wider">
              {examCode}
            </p>
          </div>
          <p className="text-sm text-gray-500">
            Redirecting to dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <button
          onClick={() => router.push('/teacher')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </button>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-8">
            Create New Exam
          </h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Exam Details */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Exam Title *
                </label>
                <input
                  type="text"
                  value={exam.title}
                  onChange={(e) => setExam({ ...exam, title: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="e.g., English Grammar Test"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={exam.description}
                  onChange={(e) => setExam({ ...exam, description: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  rows="2"
                  placeholder="Brief description of the exam"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  value={exam.duration_minutes}
                  onChange={(e) => setExam({ ...exam, duration_minutes: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  min="1"
                />
              </div>
            </div>

            {/* Questions */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">Questions</h2>
                <button
                  type="button"
                  onClick={addQuestion}
                  className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
                >
                  <Plus className="w-4 h-4" />
                  Add Question
                </button>
              </div>

              <div className="space-y-4">
                {exam.questions.map((question, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-semibold text-gray-700">
                        Question {index + 1}
                      </h3>
                      {exam.questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeQuestion(index)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Question Text *
                        </label>
                        <input
                          type="text"
                          value={question.question_text}
                          onChange={(e) => updateQuestion(index, 'question_text', e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          placeholder="Enter question..."
                          required
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Type
                          </label>
                          <select
                            value={question.type}
                            onChange={(e) => updateQuestion(index, 'type', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          >
                            <option value="mcq">Multiple Choice</option>
                            <option value="written">Written Answer</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Correct Answer *
                          </label>
                          <input
                            type="text"
                            value={question.correct_answer}
                            onChange={(e) => updateQuestion(index, 'correct_answer', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            placeholder={question.type === 'mcq' ? 'A, B, C...' : 'Answer'}
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Points
                          </label>
                          <input
                            type="number"
                            value={question.points}
                            onChange={(e) => updateQuestion(index, 'points', parseFloat(e.target.value))}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            min="0.5"
                            step="0.5"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => router.push('/teacher')}
                className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400 transition flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Creating...' : 'Create Exam'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}