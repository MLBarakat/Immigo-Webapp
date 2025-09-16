import React from 'react';
import { X, Settings, User, LogOut, Trash2, Download } from 'lucide-react';

interface MobileMenuOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAppSettings: () => void;
  onOpenAccountSettings: () => void;
  onSignOut: () => void;
  onClearConversation: () => void;
  onDownloadTranscript: () => void;
  user: {
    name: string;
    initials: string;
  };
}

export const MobileMenuOverlay: React.FC<MobileMenuOverlayProps> = ({
  isOpen,
  onClose,
  onOpenAppSettings,
  onOpenAccountSettings,
  onSignOut,
  onClearConversation,
  onDownloadTranscript,
  user
}) => {
  if (!isOpen) return null;

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 lg:hidden" onClick={onClose}>
      <div className="absolute inset-y-0 left-0 w-4/5 max-w-sm bg-immigo-gray-50 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between p-4 border-b border-immigo-gray-200">
          <h2 className="text-xl font-bold text-deep-navy font-display">Menu</h2>
          <button onClick={onClose} className="p-2 text-immigo-gray-600 rounded-full hover:bg-immigo-gray-200">
            <X className="w-6 h-6" />
          </button>
        </header>

        <nav className="flex-1 p-4 space-y-4">
          <div>
            <h3 className="px-3 text-xs font-semibold text-immigo-gray-600 uppercase tracking-wider">Account</h3>
            <button onClick={() => handleAction(onOpenAccountSettings)} className="w-full flex items-center p-3 mt-1 space-x-3 text-left rounded-lg hover:bg-immigo-gray-200">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-art-blue-100 text-art-blue-700 font-bold">
                {user.initials}
              </div>
              <span className="font-semibold text-deep-navy">{user.name}</span>
            </button>
          </div>

          <div>
            <h3 className="px-3 text-xs font-semibold text-immigo-gray-600 uppercase tracking-wider">Application</h3>
            <button onClick={() => handleAction(onOpenAppSettings)} className="w-full flex items-center p-3 mt-1 space-x-3 text-left rounded-lg hover:bg-immigo-gray-200">
              <Settings className="w-6 h-6 text-immigo-gray-700" />
              <span className="font-semibold text-deep-navy">Settings</span>
            </button>
          </div>

          <div>
            <h3 className="px-3 text-xs font-semibold text-immigo-gray-600 uppercase tracking-wider">Tools</h3>
            <div className="mt-1">
              <button onClick={() => handleAction(onClearConversation)} className="w-full flex items-center p-3 space-x-3 text-left rounded-lg hover:bg-immigo-gray-200">
                <Trash2 className="w-6 h-6 text-immigo-gray-700" />
                <span className="font-semibold text-deep-navy">Clear Conversation</span>
              </button>
              <button onClick={() => handleAction(onDownloadTranscript)} className="w-full flex items-center p-3 space-x-3 text-left rounded-lg hover:bg-immigo-gray-200">
                <Download className="w-6 h-6 text-immigo-gray-700" />
                <span className="font-semibold text-deep-navy">Download Transcript</span>
              </button>
            </div>
          </div>
        </nav>

        <footer className="p-4 border-t border-immigo-gray-200">
          <button onClick={() => handleAction(onSignOut)} className="w-full flex items-center p-3 space-x-3 text-left rounded-lg hover:bg-immigo-gray-200">
            <LogOut className="w-6 h-6 text-art-red-600" />
            <span className="font-semibold text-art-red-600">Logout</span>
          </button>
        </footer>
      </div>
    </div>
  );
};