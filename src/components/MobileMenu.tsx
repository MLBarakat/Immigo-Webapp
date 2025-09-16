import React from 'react';
import { X, Settings, User, Trash2, Download, LogOut, ChevronRight } from 'lucide-react';
import { User as SupabaseUser } from '@supabase/supabase-js';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  user: SupabaseUser | null;
  onSignOut: () => void;
  onOpenAppSettings: () => void;
  onOpenAccountSettings: () => void;
  onClearConversation: () => void;
  onDownloadTranscript: () => void;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({
  isOpen,
  onClose,
  user,
  onSignOut,
  onOpenAppSettings,
  onOpenAccountSettings,
  onClearConversation,
  onDownloadTranscript,
}) => {
  const userInitials = user?.email ? user.email.charAt(0).toUpperCase() : '?';
  const userEmail = user?.email || 'Guest';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 md:hidden flex justify-end">
      <div className="bg-star-white dark:bg-gray-800 w-full max-w-xs h-full shadow-lg flex flex-col">
        <header className="flex items-center justify-between p-4 border-b border-immigo-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-deep-navy dark:text-star-white font-display">Menu</h2>
          <button onClick={onClose} aria-label="Close menu" className="p-2 rounded-full hover:bg-immigo-gray-100 dark:hover:bg-gray-700">
            <X className="w-6 h-6 text-immigo-gray-600 dark:text-immigo-gray-300" />
          </button>
        </header>

        <nav className="flex-grow p-4 space-y-6 overflow-y-auto">
          {/* Account Section */}
          <div>
            <h3 className="text-sm font-semibold text-immigo-gray-600 dark:text-immigo-gray-400 mb-2">ACCOUNT</h3>
            <button
              onClick={onOpenAccountSettings}
              className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-immigo-gray-100 dark:hover:bg-gray-700 text-deep-navy dark:text-star-white"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 bg-art-blue-600 text-star-white rounded-full font-semibold text-xs">
                  {userInitials}
                </div>
                <span className="font-medium">{userEmail}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-immigo-gray-400" />
            </button>
          </div>

          <hr className="border-immigo-gray-200 dark:border-gray-700" />

          {/* Application Section */}
          <div>
            <h3 className="text-sm font-semibold text-immigo-gray-600 dark:text-immigo-gray-400 mb-2">APPLICATION</h3>
            <button
              onClick={onOpenAppSettings}
              className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-immigo-gray-100 dark:hover:bg-gray-700 text-deep-navy dark:text-star-white"
            >
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-immigo-gray-600 dark:text-immigo-gray-300" />
                <span className="font-medium">Settings</span>
              </div>
              <ChevronRight className="w-5 h-5 text-immigo-gray-400" />
            </button>
          </div>

          <hr className="border-immigo-gray-200 dark:border-gray-700" />

          {/* Tools Section */}
          <div>
            <h3 className="text-sm font-semibold text-immigo-gray-600 dark:text-immigo-gray-400 mb-2">TOOLS</h3>
            <button
              onClick={onClearConversation}
              className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-immigo-gray-100 dark:hover:bg-gray-700 text-deep-navy dark:text-star-white"
            >
              <Trash2 className="w-5 h-5 text-immigo-gray-600 dark:text-immigo-gray-300" />
              <span className="font-medium">Clear Conversation</span>
            </button>
            <button
              onClick={onDownloadTranscript}
              className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-immigo-gray-100 dark:hover:bg-gray-700 text-deep-navy dark:text-star-white"
            >
              <Download className="w-5 h-5 text-immigo-gray-600 dark:text-immigo-gray-300" />
              <span className="font-medium">Download Transcript</span>
            </button>
          </div>

          <hr className="border-immigo-gray-200 dark:border-gray-700" />

          {/* Logout Button */}
          <div>
            <button
              onClick={onSignOut}
              className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-immigo-gray-100 dark:hover:bg-gray-700 text-deep-navy dark:text-star-white"
            >
              <LogOut className="w-5 h-5 text-immigo-gray-600 dark:text-immigo-gray-300" />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
};