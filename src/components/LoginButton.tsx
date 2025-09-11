import React from 'react';
import { LogIn } from 'lucide-react';

interface LoginButtonProps {
  onLogin: () => Promise<void>;
}

export const LoginButton: React.FC<LoginButtonProps> = ({ onLogin }) => {
  return (
    <button
      onClick={onLogin}
      className="flex items-center justify-center px-4 py-2 border border-transparent text-sm font-bold rounded-lg shadow-md text-star-white bg-art-blue-600 hover:bg-art-blue-700 focus:outline-none focus:ring-4 focus:ring-art-blue-300 transform hover:scale-105 transition-all duration-200"
    >
      <LogIn className="h-5 w-5 mr-2" />
      Login
    </button>
  );
};