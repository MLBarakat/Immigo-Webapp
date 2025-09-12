import React from 'react';
import { X } from 'lucide-react';

interface TermsModalProps {
  onClose: () => void;
}

export const TermsModal: React.FC<TermsModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-star-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <header className="flex items-center justify-between p-6 border-b border-immigo-gray-200">
          <h2 className="text-2xl font-bold text-deep-navy font-display">Terms and Conditions</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-immigo-gray-100">
            <X className="w-6 h-6 text-immigo-gray-600" />
          </button>
        </header>
        <main className="p-8 overflow-y-auto prose">
          <h3>1. Introduction</h3>
          <p>Welcome to Immigo ("we", "our", "us"). These Terms and Conditions govern your use of our web application. By creating an account, you agree to these terms in full.</p>

          <h3>2. User Accounts</h3>
          <p>When you create an account with us, you must provide information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account.</p>

          <h3>3. Content</h3>
          <p>Our service allows you to post, link, store, share and otherwise make available certain information, text, graphics, or other material ("Content"). You are responsible for the Content that you post on or through the Service, including its legality, reliability, and appropriateness.</p>

          <h3>4. Prohibited Uses</h3>
          <p>You may use the Service only for lawful purposes and in accordance with the Terms. You agree not to use the Service in any way that violates any applicable national or international law or regulation.</p>

          <h3>5. Termination</h3>
          <p>We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.</p>

          <h3>6. Governing Law</h3>
          <p>These Terms shall be governed and construed in accordance with the laws of the United States, without regard to its conflict of law provisions.</p>

          <p>Last updated: September 11, 2025</p>
        </main>
        <footer className="p-6 border-t border-immigo-gray-200 flex justify-end">
            <button
                onClick={onClose}
                className="px-6 py-2 bg-art-blue-600 text-star-white font-bold rounded-lg shadow-md hover:bg-art-blue-700"
            >
                Close
            </button>
        </footer>
      </div>
    </div>
  );
};
