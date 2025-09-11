import React from 'react';
import { LoginButton } from './LoginButton';
import ImmigoLogo from '../assets/immigo_logo.png';

interface LoginPageProps {
  onLogin: () => Promise<void>;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  return (
    <div className="h-screen bg-gradient-to-br from-immigo-gray-50 via-star-white to-immigo-gray-50 flex flex-col items-center justify-center p-4">
      <div className="text-center flex flex-col items-center bg-star-white p-8 sm:p-12 rounded-2xl shadow-2xl border border-immigo-gray-200">
        <img src={ImmigoLogo} alt="Immigo Logo" className="w-24 h-24 sm:w-32 sm:h-32 object-contain mb-6 drop-shadow-lg" />
        <h1 className="text-4xl sm:text-5xl font-extrabold font-display bg-gradient-to-r from-art-red-700 via-art-blue-700 to-deep-navy bg-clip-text text-transparent drop-shadow-lg">
          Welcome to Immigo
        </h1>
        <p className="text-deep-navy font-semibold text-lg mt-2 tracking-wide max-w-sm">
          Your personal AI assistant to support your application journey.
        </p>
        <div className="mt-8">
          <LoginButton onLogin={onLogin} />
        </div>
      </div>
       <footer className="absolute bottom-0 py-4 text-center w-full">
        <div className="text-immigo-gray-600 text-sm font-medium">
            <p>&copy; 2025 Immigo. All rights reserved.</p>
          </div>
      </footer>
    </div>
  );
};