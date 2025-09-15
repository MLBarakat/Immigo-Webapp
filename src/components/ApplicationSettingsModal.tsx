import React from 'react';
import { X } from 'lucide-react';

// In a real implementation, props would be passed to control the state of these settings.
interface ApplicationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApplicationSettingsModal: React.FC<ApplicationSettingsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-star-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <header className="flex items-center justify-between p-6 border-b border-immigo-gray-200">
          <h2 className="text-2xl font-bold text-deep-navy font-display">Application Settings</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-immigo-gray-100">
            <X className="w-6 h-6 text-immigo-gray-600" />
          </button>
        </header>
        <main className="p-8 space-y-6 overflow-y-auto">
          {/* Feature sections as per the wireframe */}
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-deep-navy">Appearance</h3>
              <p className="text-sm text-immigo-gray-600">Choose how ImmiGo looks.</p>
            </div>
            <div className="p-1 bg-immigo-gray-200 rounded-lg flex space-x-1">
                <button className="px-3 py-1 text-sm rounded-md bg-star-white shadow">System</button>
                <button className="px-3 py-1 text-sm rounded-md">Light</button>
                <button className="px-3 py-1 text-sm rounded-md">Dark</button>
            </div>
          </div>
          <hr className="border-immigo-gray-200" />
          {/* Other settings like AI Voice, Live Feedback, etc., would follow this pattern. */}
          <div>
            <h3 className="font-semibold text-deep-navy">Manage Subscription</h3>
            <p className="text-sm text-immigo-gray-600">View your current plan and explore premium features.</p>
            <button className="mt-2 text-sm font-bold text-art-blue-600">View Plans →</button>
          </div>
        </main>
      </div>
    </div>
  );
};