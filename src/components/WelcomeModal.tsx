import React from 'react';
import { Hand } from 'lucide-react';

interface WelcomeModalProps {
  userName: string;
  onClose: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ userName, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 transition-opacity duration-300">
      <div className="bg-star-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center transform transition-all duration-300 scale-95 animate-scale-in">
        <Hand className="w-12 h-12 text-art-blue-500 mx-auto mb-4" />
        <h2 className="text-3xl font-bold text-deep-navy font-display mb-2">Welcome to ImmiGo, {userName}!</h2>
        <p className="text-immigo-gray-600 mb-6">Here's a quick guide to get you started:</p>
        <ul className="text-left space-y-3 text-immigo-gray-700 list-disc list-inside mb-8">
          <li>Press the large <span className="font-bold text-art-blue-600">mic button</span> to start a conversation.</li>
          <li>Feel free to <span className="font-bold text-art-blue-600">interrupt the AI</span> at any time by simply speaking.</li>
          <li>Click the <span className="font-bold text-art-red-600">stop button</span> when you're finished with the session.</li>
        </ul>
        <button
          onClick={onClose}
          className="w-full px-6 py-3 bg-art-blue-600 text-star-white font-bold rounded-lg shadow-md hover:bg-art-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-art-blue-500 transition-transform transform hover:scale-105"
        >
          Let's Get Started
        </button>
      </div>
    </div>
  );
};