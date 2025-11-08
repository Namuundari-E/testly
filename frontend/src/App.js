import React, { useState } from 'react';
import { Upload, CheckCircle, XCircle, Loader2, FileText, Camera } from 'lucide-react';

export default function TestCheckerApp() {
  const [testImage, setTestImage] = useState(null);
  const [testConfig, setTestConfig] = useState({
    answers: [
      { question_id: "1", type: "mcq", correct_answer: "B", points: 2 },
      { question_id: "2", type: "mcq", correct_answer: "A", points: 2 },
      { question_id: "3", type: "written", correct_answer: "Монгол Улс", points: 5 }
    ]
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [activeTab, setActiveTab] = useState('upload');

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setTestImage(file);
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleCheckTest = async () => {
    if (!testImage) {
      alert('Please upload a test image first');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('test_image', testImage);
      formData.append('test_config', JSON.stringify(testConfig));

      const response = await fetch(`${API_URL}/check-test`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to check test');

      const data = await response.json();
      setResult(data);
      setActiveTab('results');
    } catch (error) {
      console.error('Error:', error);
      alert('Error checking test: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const addAnswer = () => {
    setTestConfig({
      ...testConfig,
      answers: [
        ...testConfig.answers,
        { question_id: `${testConfig.answers.length + 1}`, type: "mcq", correct_answer: "", points: 1 }
      ]
    });
  };

  const updateAnswer = (index, field, value) => {
    const newAnswers = [...testConfig.answers];
    newAnswers[index][field] = value;
    setTestConfig({ ...testConfig, answers: newAnswers });
  };

  const removeAnswer = (index) => {
    const newAnswers = testConfig.answers.filter((_, i) => i !== index);
    setTestConfig({ ...testConfig, answers: newAnswers });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-xl">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Автомат Шалгалт Система</h1>
              <p className="text-gray-600">AI-тай шалгах тест - OMR, OCR болон LLM ашиглан</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-lg mb-6">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 px-6 py-4 font-semibold transition ${
                activeTab === 'upload'
                  ? 'bg-indigo-600 text-white rounded-tl-2xl'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              1. Зураг оруулах
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`flex-1 px-6 py-4 font-semibold transition ${
                activeTab === 'config'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              2. Хариулт тохируулах
            </button>
            <button
              onClick={() => setActiveTab('results')}
              className={`flex-1 px-6 py-4 font-semibold transition ${
                activeTab === 'results'
                  ? 'bg-indigo-600 text-white rounded-tr-2xl'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              disabled={!result}
            >
              3. Үр дүн
            </button>
          </div>

          <div className="p-6">
            {/* Upload Tab */}
            {activeTab === 'upload' && (
              <div className="space-y-6">
                <div className="border-2 border-dashed border-indigo-300 rounded-xl p-8 text-center hover:border-indigo-500 transition">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Camera className="w-16 h-16 mx-auto text-indigo-600 mb-4" />
                    <p className="text-lg font-semibold text-gray-700 mb-2">
                      Тестийн зургийг оруулах
                    </p>
                    <p className="text-gray-500">Энд дарж зураг сонгох эсвэл зургийг чирж оруулах</p>
                  </label>
                </div>

                {imagePreview && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="font-semibold text-gray-700 mb-3">Оруулсан зураг:</p>
                    <img
                      src={imagePreview}
                      alt="Test preview"
                      className="max-w-full h-auto rounded-lg shadow-md mx-auto"
                      style={{ maxHeight: '500px' }}
                    />
                  </div>
                )}

                <button
                  onClick={() => setActiveTab('config')}
                  className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition"
                  disabled={!testImage}
                >
                  Дараагийн алхам →
                </button>
              </div>
            )}

            {/* Config Tab */}
            {activeTab === 'config' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-800">Зөв хариултуудыг оруулах</h3>
                  <button
                    onClick={addAnswer}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
                  >
                    + Асуулт нэмэх
                  </button>
                </div>

                <div className="space-y-4">
                  {testConfig.answers.map((answer, index) => (
                    <div key={index} className="bg-gray-50 rounded-xl p-4 flex gap-4 items-start">
                      <div className="flex-1 grid grid-cols-4 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Асуулт #
                          </label>
                          <input
                            type="text"
                            value={answer.question_id}
                            onChange={(e) => updateAnswer(index, 'question_id', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Төрөл
                          </label>
                          <select
                            value={answer.type}
                            onChange={(e) => updateAnswer(index, 'type', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg"
                          >
                            <option value="mcq">Сонгох</option>
                            <option value="written">Бичих</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Зөв хариулт
                          </label>
                          <input
                            type="text"
                            value={answer.correct_answer}
                            onChange={(e) => updateAnswer(index, 'correct_answer', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg"
                            placeholder={answer.type === 'mcq' ? 'A, B, C...' : 'Бичсэн хариулт'}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Оноо
                          </label>
                          <input
                            type="number"
                            value={answer.points}
                            onChange={(e) => updateAnswer(index, 'points', parseFloat(e.target.value))}
                            className="w-full px-3 py-2 border rounded-lg"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => removeAnswer(index)}
                        className="text-red-600 hover:text-red-800 p-2"
                      >
                        <XCircle className="w-6 h-6" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleCheckTest}
                  disabled={loading}
                  className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition disabled:bg-gray-400 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Шалгаж байна...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Тест шалгах
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Results Tab */}
            {activeTab === 'results' && result && (
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
                  <h3 className="text-2xl font-bold mb-4">Үр дүн</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-indigo-100 mb-1">Нийт оноо</p>
                      <p className="text-5xl font-bold">
                        {result.total_score.toFixed(1)} / {result.max_score}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-indigo-100 mb-1">Хувь</p>
                      <p className="text-5xl font-bold">
                        {((result.total_score / result.max_score) * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {result.details.map((detail, index) => (
                    <div
                      key={index}
                      className={`rounded-xl p-4 border-2 ${
                        detail.score === detail.max_points
                          ? 'bg-green-50 border-green-300'
                          : detail.score > 0
                          ? 'bg-yellow-50 border-yellow-300'
                          : 'bg-red-50 border-red-300'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-gray-800">
                          Асуулт {detail.question_id}
                          <span className="ml-2 text-sm font-normal text-gray-600">
                            ({detail.type === 'mcq' ? 'Сонгох' : 'Бичих'})
                          </span>
                        </h4>
                        <span className="font-bold text-lg">
                          {detail.score.toFixed(1)} / {detail.max_points}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600 font-medium">Оюутны хариулт:</p>
                          <p className="text-gray-800">{detail.student_answer || 'Олдсонгүй'}</p>
                        </div>
                        <div>
                          <p className="text-gray-600 font-medium">Зөв хариулт:</p>
                          <p className="text-gray-800">{detail.correct_answer}</p>
                        </div>
                      </div>
                      {detail.similarity !== undefined && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-600">
                            Утгын адилхан байдал: {(detail.similarity * 100).toFixed(0)}%
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setResult(null);
                    setTestImage(null);
                    setImagePreview(null);
                    setActiveTab('upload');
                  }}
                  className="w-full bg-gray-600 text-white py-3 rounded-xl font-semibold hover:bg-gray-700 transition"
                >
                  Шинэ тест шалгах
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}