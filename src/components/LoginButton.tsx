import React from 'react';
import { LogIn } from 'lucide-react';

interface LoginButtonProps {
  onLogin: () => Promise<void>; // Prop type updated
}

export const LoginButton: React.FC<LoginButtonProps> = ({ onLogin }) => {
  return (
    <button
      onClick={onLogin}
      className="flex items-center justify-center ..."
    >
      <LogIn className="h-5 w-5 mr-2" />
      Login
    </button>
  );
};