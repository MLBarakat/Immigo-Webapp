import ImmigoLogo from '../assets/immigo_logo.svg';
import { Settings, LogOut, Menu, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  notificationCount?: number;
  onOpenNotifications?: () => void;
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
  notificationCount = 0,
  onOpenNotifications,
}: HeaderProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <header className="flex items-center justify-between p-4 bg-star-white dark:bg-gray-800 shadow-sm border-b-2 border-immigo-gray-300 dark:border-gray-700">
      <div className="flex items-center gap-1">
        <img src={ImmigoLogo} alt="ImmiGo Logo" className="h-10 w-10 object-contain" />
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
        <button onClick={onOpenAppSettings} aria-label={t('header.openSettings')} className="p-2 rounded-full hover:bg-immigo-gray-100 dark:hover:bg-gray-700">
          <Settings className="w-6 h-6 text-immigo-gray-600 dark:text-gray-300" />
        </button>
        <button onClick={onOpenAccountSettings} aria-label={t('header.openAccount')} className="w-9 h-9 bg-art-blue-600 text-star-white rounded-full flex items-center justify-center font-bold">
          {displayUser.initials}
        </button>
        <button onClick={onSignOut} aria-label={t('header.signOut')} className="p-2 rounded-full hover:bg-immigo-gray-100 dark:hover:bg-gray-700">
          <LogOut className="w-6 h-6 text-art-red-600" />
        </button>
      </nav>

      <div className="md:hidden flex items-center gap-1">
        {onOpenNotifications && (
          <button
            onClick={onOpenNotifications}
            aria-label={t('header.openNotifications')}
            className="relative p-2 rounded-full hover:bg-immigo-gray-100 dark:hover:bg-gray-700"
          >
            <Bell className="w-6 h-6 text-immigo-gray-600 dark:text-gray-300" />
            {notificationCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-art-red-600 px-1 text-[10px] font-bold leading-none text-white"
                aria-label={t('notifications.unreadCount', { count: notificationCount })}
              >
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>
        )}
        <button onClick={onToggleMobileMenu} aria-label={t('header.openMenu')} className="p-2 rounded-full hover:bg-immigo-gray-100 dark:hover:bg-gray-700">
          <Menu className="w-6 h-6 text-immigo-gray-600 dark:text-gray-300" />
        </button>
      </div>
    </header>
  );
}
