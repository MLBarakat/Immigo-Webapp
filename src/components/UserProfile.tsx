import React from 'react';

interface UserProfileProps {
  user: {
    name: string;
    initials: string;
  };
}

export const UserProfile: React.FC<UserProfileProps> = ({ user }) => {
  return (
    <div className="flex items-center space-x-2">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-art-blue-100 text-art-blue-700 font-bold text-lg flex-shrink-0">
        {user.initials}
      </div>
    </div>
  );
};