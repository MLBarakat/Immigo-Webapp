import ImmigoLogo from '../assets/immigo_logo.png';
import { Settings, LogOut, Menu } from 'lucide-react';
import { DisplayUser } from '../types/user';
import { LanguageSelector } from './LanguageSelector';
import { FontSizeSelector } from './FontSizeSelector';
import { UserSettings } from '../types/settings';
import { ImmiGOLabel } from './ImmiGOLabel';

interface HeaderProps {
  displayUser: DisplayUser;
  userSettings: Partial<UserSettings>;
  onOpenAppSettings: () => void;
  onOpenAccountSettings: () => void;
  onSignOut: () => void;
  onToggleMobileMenu: () => void;
  onSettingChange: (key: keyof UserSettings, value: unknown) => void;
  currentLanguageCode: string;
  onLanguageChange: (newLanguageCode: string) => void;
}

export function Header({
  displayUser,
  userSettings,
  onOpenAppSettings,
  onOpenAccountSettings,
  onSignOut,
  onToggleMobileMenu,
  onSettingChange,
  currentLanguageCode,
  onLanguageChange,
}: HeaderProps): JSX.Element {
  return (
    <header className="flex items-center justify-between p-4 bg-star-white shadow-sm border-b-2 border-immigo-gray-300">
      <div className="flex items-center gap-4">
        <img src={ImmigoLogo} alt="ImmiGo Logo" className="h-10 w-10" />
        <ImmiGOLabel className="flex items-baseline font-sans font-bold text-3xl select-none" />
      </div>

      <nav className="hidden md:flex items-center space-x-4">
        <LanguageSelector
          currentLanguageCode={currentLanguageCode}
          onLanguageChange={onLanguageChange}
        />
        <FontSizeSelector
          currentFontSize={userSettings.font_size || 'default'}
          onFontSizeChange={(size) => onSettingChange('font_size', size)}
        />
        <button onClick={onOpenAppSettings} className="p-2 rounded-full hover:bg-immigo-gray-100">
          <Settings className="w-6 h-6 text-immigo-gray-600" />
        </button>
        <button onClick={onOpenAccountSettings} className="w-9 h-9 bg-art-blue-600 text-star-white rounded-full flex items-center justify-center font-bold">
          {displayUser.initials}
        </button>
        <button onClick={onSignOut} className="p-2 rounded-full hover:bg-immigo-gray-100">
          <LogOut className="w-6 h-6 text-art-red-600" />
        </button>
      </nav>

      <div className="md:hidden">
        <button onClick={onToggleMobileMenu} className="p-2 rounded-full hover:bg-immigo-gray-100">
          <Menu className="w-6 h-6 text-immigo-gray-600" />
        </button>
      </div>
    </header>
  );
}