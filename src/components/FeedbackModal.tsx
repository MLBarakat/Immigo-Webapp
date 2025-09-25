import React from 'react';
import { X, Sparkles, BrainCircuit, Loader2 } from 'lucide-react';

interface Feedback {
  summary: string;
  suggestions: string[];
}

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  feedback: Feedback | null;
  error: string | null;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, isLoading, feedback, error }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 transition-opacity duration-300">
      <div className="bg-star-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col transform transition-all duration-300 scale-95 animate-scale-in">
        <header className="flex items-center justify-between p-6 border-b border-immigo-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-art-blue-600" />
            <h2 className="text-2xl font-bold text-deep-navy font-display">Session Feedback</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-immigo-gray-100 transition-colors">
            <X className="w-6 h-6 text-immigo-gray-600" />
          </button>
        </header>

        <main className="p-8 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-immigo-gray-600">
              <Loader2 className="w-12 h-12 animate-spin mb-4" />
              <p className="font-semibold text-lg">Analyzing your session...</p>
              <p className="text-sm">Our AI coach is reviewing the transcript.</p>
            </div>
          ) : error ? (
            <div className="text-center text-art-red-600">
              <p>Sorry, an error occurred while generating feedback.</p>
              <p className="text-sm">{error}</p>
            </div>
          ) : feedback ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-deep-navy mb-2 flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5" />
                  AI Summary
                </h3>
                <p className="text-immigo-gray-700 prose prose-slate">{feedback.summary}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-deep-navy mb-2 flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Suggestions for Improvement
                </h3>
                <ul className="list-disc list-inside space-y-2 text-immigo-gray-700">
                  {feedback.suggestions.map((suggestion, index) => (
                    <li key={index}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
};