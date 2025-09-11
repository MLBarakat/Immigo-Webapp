import React from 'react';
import { LogOut } from 'lucide-react';

interface UserProfileProps {
  user: {
    name: string;
    initials: string;
  };
  onLogout: () => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({ user, onLogout }) => {
  return (
    <div className="flex items-center space-x-3">
      <div className="flex items-center space-x-2">
        <div className="w-10 h-10 rounded-full bg-art-blue-600 flex items-center justify-center text-star-white font-bold text-sm shadow-md flex-shrink-0">
          {user.initials}
        </div>
        <span className="text-deep-navy font-semibold hidden sm:block">{user.name}</span>
      </div>
      <button
        onClick={onLogout}
        title="Logout"
        className="p-2 rounded-full text-immigo-gray-600 hover:bg-art-red-100 hover:text-art-red-600 focus:outline-none focus:ring-2 focus:ring-art-red-500 transition-colors duration-200"
      >
        <LogOut className="h-5 w-5" />
      </button>
    </div>
  );
};