import React from 'react';
import { X, ExternalLink } from 'lucide-react';
import { User } from '@supabase/supabase-js';

interface AccountSettingsPageProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  logout: () => Promise<void>;
}

export const AccountSettingsPage: React.FC<AccountSettingsPageProps> = ({ isOpen, onClose, user, logout }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-star-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden">
        <header className="flex items-center justify-between p-6 border-b border-immigo-gray-200">
          <h2 className="text-2xl font-bold text-deep-navy font-display">Account Settings</h2>
          <button onClick={onClose} aria-label="Close settings" className="p-2 rounded-full hover:bg-immigo-gray-100">
            <X className="w-6 h-6 text-immigo-gray-600" />
          </button>
        </header>

        <main className="p-8 overflow-y-auto space-y-6 text-deep-navy">
          <h3 className="font-semibold text-xl">Account Information</h3>
          <p>Email: <span className="font-medium">{user?.email}</span></p>
          <p>User ID: <span className="font-medium text-sm break-all">{user?.id}</span></p>

          <hr className="border-immigo-gray-200" />

          <h3 className="font-semibold text-xl">Manage Your Account</h3>
          <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-art-blue-600 hover:bg-art-blue-50 rounded-lg">
              Change Password <ExternalLink className="w-4 h-4" />
          </button>
          <button onClick={logout} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-art-red-600 hover:bg-art-red-50 rounded-lg">
              Logout
          </button>
        </main>

        <footer className="p-4 border-t border-immigo-gray-200 bg-immigo-gray-50 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-md hover:bg-immigo-gray-200 font-semibold">Done</button>
        </footer>
      </div>
    </div>
  );
};