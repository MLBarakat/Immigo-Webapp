import React from 'react';
import { X, Trash2, Download, LogOut, Settings, User } from 'lucide-react';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onClearConversation: () => void;
  onDownloadTranscript: () => void;
  onLogout: () => void;
  onOpenAppSettings: () => void;
  onOpenAccountSettings: () => void;
  userName: string;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({
  isOpen,
  onClose,
  onClearConversation,
  onDownloadTranscript,
  onLogout,
  onOpenAppSettings,
  onOpenAccountSettings,
  userName
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-end z-50 lg:hidden" onClick={onClose}>
      <div
        className="w-80 bg-star-white h-full shadow-2xl p-6 animate-slide-in flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-8 flex-shrink-0">
          <h2 className="text-xl font-bold text-deep-navy">Menu</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-immigo-gray-100">
            <X className="w-6 h-6 text-immigo-gray-600" />
          </button>
        </div>

        <div className="space-y-4 flex-grow overflow-y-auto">
          {/* ACCOUNT */}
          <button onClick={onOpenAccountSettings} className="w-full flex items-center p-3 rounded-lg hover:bg-immigo-gray-100 text-left">
            <User className="w-5 h-5 text-immigo-gray-600 mr-3" /> {userName}
          </button>
          <hr />
          {/* APPLICATION */}
          <button onClick={onOpenAppSettings} className="w-full flex items-center p-3 rounded-lg hover:bg-immigo-gray-100 text-left">
            <Settings className="w-5 h-5 text-immigo-gray-600 mr-3" /> Application Settings
          </button>
          <hr />
          {/* TOOLS */}
          <button onClick={onClearConversation} className="w-full flex items-center p-3 rounded-lg hover:bg-immigo-gray-100 text-left">
              <Trash2 className="w-5 h-5 text-immigo-gray-600 mr-3" /> Clear Conversation
          </button>
          <button onClick={onDownloadTranscript} className="w-full flex items-center p-3 rounded-lg hover:bg-immigo-gray-100 text-left">
              <Download className="w-5 h-5 text-immigo-gray-600 mr-3" /> Download Transcript
          </button>
        </div>

        <div className="mt-8 flex-shrink-0">
            <hr className="mb-4" />
            <button
                onClick={onLogout}
                className="w-full flex items-center p-3 rounded-lg bg-art-red-100 text-art-red-700 hover:bg-art-red-200 text-left font-semibold"
            >
                <LogOut className="w-5 h-5 mr-3" /> Logout
            </button>
        </div>
      </div>
    </div>
  );
};