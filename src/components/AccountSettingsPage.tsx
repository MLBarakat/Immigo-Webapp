import { useState } from 'react';
import { ApiClient } from '../services/apiClient';
import { ArrowLeft, User, Lock, Share2, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import amplifyOutputs from '../../amplify_outputs.json';

interface AccountSettingsPageProps {
  onNavigateBack: () => void;
  isDesktop: boolean;
}

type SettingsView = 'profile' | 'security' | 'connections' | 'delete';

export const AccountSettingsPage = ({ onNavigateBack, isDesktop }: AccountSettingsPageProps): JSX.Element => {
  const [activeView, setActiveView] = useState<SettingsView>('profile');
  const { user, profile, session, logout } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteAccount = async () => {
    if (!session?.access_token) {
      setDeleteError('You must be signed in to delete your account.');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dynamicGatewayUrl = (amplifyOutputs as any)?.custom?.apiBaseUrl;
      const client = new ApiClient(session.access_token, dynamicGatewayUrl);
      await client.deleteAccount();
      await logout();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Account deletion failed. Please contact support.');
      setDeleting(false);
    }
  };

  // Dynamically map authenticated credentials out of the live session layer
  const userEmail = user?.email || '';
  const userFullName = profile?.full_name || (user?.user_metadata?.full_name as string) || '';

  const renderContent = () => {
    switch (activeView) {
      case 'profile':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-deep-navy">My Profile</h2>
            <p className="text-immigo-gray-600">Manage your personal information</p>
            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-immigo-gray-700">Full Name</label>
                <input
                  type="text"
                  id="name"
                  defaultValue={userFullName}
                  className="mt-1 block w-full rounded-md border-immigo-gray-300 shadow-sm focus:border-art-blue-500 focus:ring-art-blue-500"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-immigo-gray-700">Email</label>
                <input
                  type="email"
                  id="email"
                  defaultValue={userEmail}
                  disabled
                  className="mt-1 block w-full rounded-md border-immigo-gray-300 shadow-sm bg-immigo-gray-100 cursor-not-allowed"
                />
              </div>
              <button type="submit" className="px-4 py-2 bg-art-blue-600 text-white rounded-md font-semibold hover:bg-art-blue-700">Save Profile</button>
            </form>
          </div>
        );
      case 'security':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-deep-navy">Security & Login</h2>
            <p className="text-immigo-gray-600">Manage your password and security settings</p>
            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <div>
                <label htmlFor="current-password" className="block text-sm font-medium text-immigo-gray-700">Current Password</label>
                <input type="password" id="current-password" autoComplete="current-password" className="mt-1 block w-full rounded-md border-immigo-gray-300 shadow-sm focus:border-art-blue-500 focus:ring-art-blue-500" />
              </div>
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-immigo-gray-700">New Password</label>
                <input type="password" id="new-password" autoComplete="new-password" className="mt-1 block w-full rounded-md border-immigo-gray-300 shadow-sm focus:border-art-blue-500 focus:ring-art-blue-500" />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-immigo-gray-700">Confirm New Password</label>
                <input type="password" id="confirm-password" autoComplete="new-password" className="mt-1 block w-full rounded-md border-immigo-gray-300 shadow-sm focus:border-art-blue-500 focus:ring-art-blue-500" />
              </div>
              <button type="submit" className="px-4 py-2 bg-art-blue-600 text-white rounded-md font-semibold hover:bg-art-blue-700">Update Password</button>
            </form>
          </div>
        );
      case 'connections':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-deep-navy">Social Connections</h2>
            <p className="text-immigo-gray-600">Connect your ImmiGo account with other services</p>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-immigo-gray-200 rounded-md">
                <span>Google Account</span>
                <button className="px-3 py-1 text-sm bg-art-blue-100 text-art-blue-700 rounded-md hover:bg-art-blue-200">Connected</button>
              </div>
              <div className="flex items-center justify-between p-4 border border-immigo-gray-200 rounded-md">
                <span>Facebook</span>
                <button className="px-3 py-1 text-sm bg-immigo-gray-100 text-immigo-gray-700 rounded-md hover:bg-immigo-gray-200">Connect</button>
              </div>
            </div>
          </div>
        );
      case 'delete':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-art-red-700">Delete Account</h2>
            <p className="text-immigo-gray-600">Permanently delete your ImmiGo account and all associated data (sessions, practice results, and progress). This action cannot be undone.</p>
            {deleteError && (
              <div className="text-art-red-700 text-sm p-3 bg-art-red-50 rounded-lg">{deleteError}</div>
            )}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2 bg-art-red-600 text-white rounded-md font-semibold hover:bg-art-red-700"
              >
                Delete Account
              </button>
            ) : (
              <div className="space-y-3 p-4 border border-art-red-200 rounded-lg bg-art-red-50">
                <p className="text-sm font-semibold text-art-red-700">Are you absolutely sure? This permanently deletes your account and all associated data.</p>
                <div className="flex gap-3">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    className="px-4 py-2 bg-art-red-600 text-white rounded-md font-semibold hover:bg-art-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {deleting ? 'Deleting…' : 'Yes, permanently delete'}
                  </button>
                  <button
                    onClick={() => { setConfirmDelete(false); setDeleteError(null); }}
                    disabled={deleting}
                    className="px-4 py-2 bg-immigo-gray-100 text-immigo-gray-700 rounded-md font-semibold hover:bg-immigo-gray-200 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const containerClasses = isDesktop
    ? "fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
    : "h-screen w-screen bg-immigo-gray-100 flex flex-col font-sans";

  const contentClasses = isDesktop
    ? "bg-star-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden"
    : "flex-1 bg-immigo-gray-100 flex flex-col";

  const headerClasses = isDesktop
    ? "flex items-center justify-between p-6 border-b border-immigo-gray-200"
    : "flex items-center p-4 border-b border-immigo-gray-200 bg-star-white shadow-md flex-shrink-0";

  // Fixed layout typo from (lg => string function) back to a single string identifier
  const mainContentClasses = "flex-1 p-6 overflow-y-auto";

  return (
    <div className={containerClasses}>
      <div className={contentClasses}>
        <header className={headerClasses}>
          {!isDesktop && (
            <button onClick={onNavigateBack} className="p-2 rounded-full hover:bg-immigo-gray-100 text-immigo-gray-600">
              <ArrowLeft className="w-6 h-6" />
            </button>
          )}
          <h1 className={`font-bold text-deep-navy ${isDesktop ? 'text-2xl font-display' : 'text-xl ml-4 font-display'}`}>Account Settings</h1>
          {isDesktop && (
            <button onClick={onNavigateBack} aria-label="Close settings" className="p-2 rounded-full hover:bg-immigo-gray-100">
              <X className="w-6 h-6 text-immigo-gray-600" />
            </button>
          )}
        </header>
        <div className={mainContentClasses}>
          <div className="lg:grid lg:grid-cols-12 gap-8">
            <nav className="lg:col-span-3">
              <ul className="space-y-1">
                <li><button type="button" onClick={() => setActiveView('profile')} className={`w-full text-left flex items-center p-3 rounded-lg font-semibold ${activeView === 'profile' ? 'bg-immigo-gray-200' : 'hover:bg-immigo-gray-200'}`}><User className="w-5 h-5 mr-3" /> My Profile</button></li>
                <li><button type="button" onClick={() => setActiveView('security')} className={`w-full text-left flex items-center p-3 rounded-lg font-semibold ${activeView === 'security' ? 'bg-immigo-gray-200' : 'hover:bg-immigo-gray-200'}`}><Lock className="w-5 h-5 mr-3" /> Security & Login</button></li>
                <li><button type="button" onClick={() => setActiveView('connections')} className={`w-full text-left flex items-center p-3 rounded-lg font-semibold ${activeView === 'connections' ? 'bg-immigo-gray-200' : 'hover:bg-immigo-gray-200'}`}><Share2 className="w-5 h-5 mr-3" /> Social Connections</button></li>
                <li><button type="button" onClick={() => setActiveView('delete')} className={`w-full text-left flex items-center p-3 rounded-lg font-semibold text-art-red-700 ${activeView === 'delete' ? 'bg-art-red-50' : 'hover:bg-art-red-50'}`}><AlertTriangle className="w-5 h-5 mr-3" /> Delete My Account</button></li>
              </ul>
            </nav>
            <main className="lg:col-span-9 mt-6 lg:mt-0">
              <div className="bg-star-white p-8 rounded-lg shadow">
                {renderContent()}
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
};