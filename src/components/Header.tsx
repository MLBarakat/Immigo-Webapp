import React from 'react';
import { Settings, LogOut, Menu } from 'lucide-react';
import { LanguageSelector } from './LanguageSelector';
import { FontSizeSelector } from './FontSizeSelector';
import { UserProfile } from './UserProfile';
import ImmigoLogo from '../assets/immigo_logo.png';
import useMediaQuery from '../hooks/useMediaQuery';

interface HeaderProps {
  onOpenAppSettings: () => void;
  onLogout: () => void;
  user: {
    name: string;
    initials: string;
  };
}

export const Header: React.FC<HeaderProps> = ({ onOpenAppSettings, onLogout, user }) => {
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  return (
    <header className="flex items-center justify-between p-3 bg-star-white border-b border-immigo-gray-200 shadow-sm flex-shrink-0">
      <div className="flex items-center space-x-3">
        <img src={ImmigoLogo} alt="Immigo Logo" className="w-10 h-10 object-contain" />
        <h1 className="text-2xl font-bold text-deep-navy font-display hidden sm:block">ImmiGo</h1>
      </div>

      {isDesktop ? (
        <div className="flex items-center space-x-4">
          <LanguageSelector currentLanguageCode="en" onLanguageChange={() => {}} />
          <FontSizeSelector />
          <button onClick={onOpenAppSettings} className="p-2 text-immigo-gray-600 hover:text-deep-navy hover:bg-immigo-gray-100 rounded-full">
            <Settings className="w-6 h-6" />
          </button>
          <UserProfile user={user} />
          <button onClick={onLogout} className="p-2 text-immigo-gray-600 hover:text-deep-navy hover:bg-immigo-gray-100 rounded-full">
            <LogOut className="w-6 h-6" />
          </button>
        </div>
      ) : (
        <button className="p-2 text-immigo-gray-600 hover:text-deep-navy hover:bg-immigo-gray-100 rounded-full">
          <Menu className="w-6 h-6" />
        </button>
      )}
    </header>
  );
};