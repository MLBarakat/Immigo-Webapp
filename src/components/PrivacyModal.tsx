import React from 'react';
import { X } from 'lucide-react';
import { privacyContent } from '../legal/privacy-content';

interface PrivacyModalProps {
  onClose: () => void;
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 transition-opacity duration-300">
      <div className="bg-star-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col transform transition-all duration-300 scale-95 animate-scale-in">
        <header className="flex items-center justify-between p-6 border-b border-immigo-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-deep-navy font-display">Privacy Policy</h2>
            <p className="text-sm text-immigo-gray-600">Last updated: {privacyContent.effectiveDate}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-immigo-gray-100 transition-colors">
            <X className="w-6 h-6 text-immigo-gray-600" />
          </button>
        </header>

        <main className="p-8 overflow-y-auto prose prose-slate max-w-none">
          {privacyContent.sections.map((section) => (
            <div key={section.title} className="mb-6">
              <h3 className="text-deep-navy">{section.title}</h3>
              <p className="text-immigo-gray-700">{section.content}</p>
            </div>
          ))}
        </main>

        <footer className="p-6 border-t border-immigo-gray-200 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-art-blue-600 text-star-white font-bold rounded-lg shadow-md hover:bg-art-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-art-blue-500 transition-transform transform hover:scale-105"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
};
