import React from 'react';
import ImmigoLogo from '../assets/immigo_logo.png';
import { Settings, LogOut, Menu } from 'lucide-react';
import { UserSettings } from '../types/settings';
import { DisplayUser } from '../types/user'; // Import the new type
import { LanguageSelector } from './LanguageSelector';
import { FontSizeSelector } from './FontSizeSelector';

interface HeaderProps {
  displayUser: DisplayUser; // Use the new type
  userSettings: Partial<UserSettings>;
  onOpenAppSettings: () => void;
  onOpenAccountSettings: () => void;
  onSignOut: () => void;
  onToggleMobileMenu: () => void;
  onSettingChange: (key: keyof UserSettings, value: any) => void;
}

export const Header: React.FC<HeaderProps> = ({
  displayUser,
  userSettings,
  onOpenAppSettings,
  onOpenAccountSettings,
  onSignOut,
  onToggleMobileMenu,
  onSettingChange,
}) => {
  return (
    <header className="flex items-center justify-between p-4 bg-star-white dark:bg-gray-800 shadow-sm border-b border-immigo-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 md:gap-4">
        <img src={ImmigoLogo} alt="ImmiGo Logo" className="h-8 w-8 md:h-10 md:w-10" />
        <h1 className="text-xl md:text-2xl font-bold text-deep-navy dark:text-star-white font-display">ImmiGo</h1>
      </div>

      {/* Desktop Navigation */}
      <nav className="hidden md:flex items-center space-x-4">
        <LanguageSelector
          currentLanguage="EN"
          onLanguageChange={() => console.log('Language change')}
        />
        <FontSizeSelector
          currentFontSize={userSettings.font_size || 'default'}
          onFontSizeChange={(size) => onSettingChange('font_size', size)}
        />
        <button
          onClick={onOpenAppSettings}
          className="p-2 rounded-full hover:bg-immigo-gray-100 dark:hover:bg-gray-700 text-immigo-gray-600 dark:text-immigo-gray-300"
          aria-label="Application Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
        <button
          onClick={onOpenAccountSettings}
          className="flex items-center justify-center w-9 h-9 bg-art-blue-600 text-star-white rounded-full font-semibold text-sm hover:opacity-90 transition-opacity"
          aria-label={`User Profile for ${displayUser.name}`}
        >
          {displayUser.initials}
        </button>
        <button
          onClick={onSignOut}
          className="p-2 rounded-full hover:bg-immigo-gray-100 dark:hover:bg-gray-700 text-immigo-gray-600 dark:text-immigo-gray-300"
          aria-label="Logout"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </nav>

      {/* Mobile Menu Toggle */}
      <div className="md:hidden flex items-center">
        <button
          onClick={onToggleMobileMenu}
          className="p-2 rounded-full hover:bg-immigo-gray-100 dark:hover:bg-gray-700 text-immigo-gray-600 dark:text-immigo-gray-300"
          aria-label="Open mobile menu"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>
    </header>
  );
};