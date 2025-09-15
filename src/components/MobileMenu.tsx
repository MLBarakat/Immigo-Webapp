import React from 'react';
import { Settings, User, LogOut, MessageSquare } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface MobileMenuProps {
  onOpenAppSettings: () => void;
  onOpenAccountSettings: () => void;
  onSignOut: () => void;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({ onOpenAppSettings, onOpenAccountSettings, onSignOut }) => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-star-white border-t border-immigo-gray-200 shadow-lg lg:hidden z-40">
      <ul className="flex justify-around items-center h-16">
        <li>
          <Link to="/" className={`flex flex-col items-center justify-center p-2 text-sm font-medium ${isActive('/') ? 'text-art-blue-600' : 'text-immigo-gray-600 hover:text-deep-navy'}`}>
            <MessageSquare className="w-6 h-6" />
            <span>Chat</span>
          </Link>
        </li>
        <li>
          <button onClick={onOpenAppSettings} className="flex flex-col items-center justify-center p-2 text-sm font-medium text-immigo-gray-600 hover:text-deep-navy">
            <Settings className="w-6 h-6" />
            <span>Settings</span>
          </button>
        </li>
        <li>
          <button onClick={onOpenAccountSettings} className="flex flex-col items-center justify-center p-2 text-sm font-medium text-immigo-gray-600 hover:text-deep-navy">
            <User className="w-6 h-6" />
            <span>Account</span>
          </button>
        </li>
        <li>
          <button onClick={onSignOut} className="flex flex-col items-center justify-center p-2 text-sm font-medium text-immigo-gray-600 hover:text-deep-navy">
            <LogOut className="w-6 h-6" />
            <span>Log Out</span>
          </button>
        </li>
      </ul>
    </nav>
  );
};