import React from 'react';
import { LogOut } from 'lucide-react';

interface UserProfileProps {
  user: {
    name: string;
    initials: string;
  };
  onLogout: () => Promise<void>; // Prop type updated
}

export const UserProfile: React.FC<UserProfileProps> = ({ user, onLogout }) => {
  return (
    <div className="flex items-center space-x-3">
      <div className="flex items-center space-x-2">
        <div className="w-10 h-10 ...">
          {user.initials}
        </div>
        <span className="text-deep-navy ...">{user.name}</span>
      </div>
      <button
        onClick={onLogout}
        title="Logout"
        className="p-2 ..."
      >
        <LogOut className="h-5 w-5" />
      </button>
    </div>
  );
};