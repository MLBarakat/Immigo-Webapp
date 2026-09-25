import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClient } from '../services/apiClient';
import { ArrowLeft, User, Lock, Share2, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import amplifyOutputs from '../../amplify_outputs.json';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface AccountSettingsPageProps {
  onNavigateBack: () => void;
  isDesktop: boolean;
}

type SettingsView = 'profile' | 'security' | 'connections' | 'delete';

export const AccountSettingsPage = ({ onNavigateBack, isDesktop }: AccountSettingsPageProps): JSX.Element => {
  const { t } = useTranslation();
  const [activeView, setActiveView] = useState<SettingsView>('profile');
  const modalRef = useFocusTrap(true);
  const { user, profile, session, logout, updateProfile, updatePassword } = useAuth();
  const [fullName, setFullName] = useState(() => profile?.full_name || (user?.user_metadata?.full_name as string) || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onNavigateBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNavigateBack]);

  const handleDeleteAccount = async () => {
    if (!session?.access_token) {
      setDeleteError(t('account.delete.mustSignIn'));
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
      setDeleteError(err instanceof Error ? err.message : t('account.delete.failed'));
      setDeleting(false);
    }
  };

  // Dynamically map authenticated credentials out of the live session layer
  const userEmail = user?.email || '';
  const userFullName = profile?.full_name || (user?.user_metadata?.full_name as string) || '';

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = fullName.trim() || userFullName;
    if (!nextName.trim()) {
      setProfileMessage(t('account.profile.fullNameRequired'));
      return;
    }
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      await updateProfile(nextName);
      setProfileMessage(t('account.profile.saved'));
    } catch (err) {
      setProfileMessage(err instanceof Error ? err.message : t('account.profile.saveFailed'));
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordMessage(null);
    if (newPassword.length < 8) {
      setPasswordMessage(t('account.security.minLength'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage(t('account.security.mismatch'));
      return;
    }
    setPasswordSaving(true);
    try {
      await updatePassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage(t('account.security.updated'));
    } catch (err) {
      setPasswordMessage(err instanceof Error ? err.message : t('account.security.updateFailed'));
    } finally {
      setPasswordSaving(false);
    }
  };

  const renderContent = () => {
    switch (activeView) {
      case 'profile':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-deep-navy">{t('account.profile.title')}</h2>
            <p className="text-immigo-gray-600">{t('account.profile.description')}</p>
            <form className="space-y-4" onSubmit={handleProfileSubmit}>
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-immigo-gray-700">{t('account.profile.fullName')}</label>
                <input
                  type="text"
                  id="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="mt-1 block w-full rounded-md border-immigo-gray-300 shadow-sm focus:border-art-blue-500 focus:ring-art-blue-500"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-immigo-gray-700">{t('account.profile.email')}</label>
                <input
                  type="email"
                  id="email"
                  value={userEmail}
                  disabled
                  className="mt-1 block w-full rounded-md border-immigo-gray-300 shadow-sm bg-immigo-gray-100 cursor-not-allowed"
                />
              </div>
              {profileMessage && <p className="text-sm text-immigo-gray-600" role="status">{profileMessage}</p>}
              <button type="submit" disabled={profileSaving} className="px-4 py-2 bg-art-blue-600 text-white rounded-md font-semibold hover:bg-art-blue-700 disabled:opacity-60">
                {profileSaving ? t('account.profile.saving') : t('account.profile.save')}
              </button>
            </form>
          </div>
        );
      case 'security':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-deep-navy">{t('account.security.title')}</h2>
            <p className="text-immigo-gray-600">{t('account.security.description')}</p>
            <form className="space-y-4" onSubmit={handlePasswordSubmit}>
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-immigo-gray-700">{t('account.security.newPassword')}</label>
                <input type="password" id="new-password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1 block w-full rounded-md border-immigo-gray-300 shadow-sm focus:border-art-blue-500 focus:ring-art-blue-500" />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-immigo-gray-700">{t('account.security.confirmPassword')}</label>
                <input type="password" id="confirm-password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 block w-full rounded-md border-immigo-gray-300 shadow-sm focus:border-art-blue-500 focus:ring-art-blue-500" />
              </div>
              {passwordMessage && <p className="text-sm text-immigo-gray-600" role="status">{passwordMessage}</p>}
              <button type="submit" disabled={passwordSaving} className="px-4 py-2 bg-art-blue-600 text-white rounded-md font-semibold hover:bg-art-blue-700 disabled:opacity-60">
                {passwordSaving ? t('account.security.updating') : t('account.security.update')}
              </button>
            </form>
          </div>
        );
      case 'connections':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-deep-navy">{t('account.connections.title')}</h2>
            <p className="text-immigo-gray-600">{t('account.connections.description')}</p>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-immigo-gray-200 rounded-md">
                <span>{t('account.connections.google')}</span>
                <span className="text-sm text-immigo-gray-500">{t('account.connections.unavailable')}</span>
              </div>
              <div className="flex items-center justify-between p-4 border border-immigo-gray-200 rounded-md">
                <span>{t('account.connections.facebook')}</span>
                <span className="text-sm text-immigo-gray-500">{t('account.connections.unavailable')}</span>
              </div>
            </div>
          </div>
        );
      case 'delete':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-art-red-700">{t('account.delete.title')}</h2>
            <p className="text-immigo-gray-600">{t('account.delete.description')}</p>
            {deleteError && (
              <div className="text-art-red-700 text-sm p-3 bg-art-red-50 rounded-lg">{deleteError}</div>
            )}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2 bg-art-red-600 text-white rounded-md font-semibold hover:bg-art-red-700"
              >
                {t('account.delete.button')}
              </button>
            ) : (
              <div className="space-y-3 p-4 border border-art-red-200 rounded-lg bg-art-red-50">
                <p className="text-sm font-semibold text-art-red-700">{t('account.delete.confirm')}</p>
                <div className="flex gap-3">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    className="px-4 py-2 bg-art-red-600 text-white rounded-md font-semibold hover:bg-art-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {deleting ? t('account.delete.deleting') : t('account.delete.yes')}
                  </button>
                  <button
                    onClick={() => { setConfirmDelete(false); setDeleteError(null); }}
                    disabled={deleting}
                    className="px-4 py-2 bg-immigo-gray-100 text-immigo-gray-700 rounded-md font-semibold hover:bg-immigo-gray-200 disabled:opacity-60"
                  >
                    {t('account.delete.cancel')}
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
      <div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="account-settings-title" className={`${contentClasses} outline-none`}>
        <header className={headerClasses}>
          {!isDesktop && (
            <button onClick={onNavigateBack} aria-label={t('account.close')} className="p-2 rounded-full hover:bg-immigo-gray-100 text-immigo-gray-600">
              <ArrowLeft className="w-6 h-6 rtl:rotate-180" />
            </button>
          )}
          <h1 id="account-settings-title" className={`font-bold text-deep-navy ${isDesktop ? 'text-2xl font-display' : 'text-xl ml-4 font-display'}`}>{t('account.title')}</h1>
          {isDesktop && (
            <button onClick={onNavigateBack} aria-label={t('account.close')} className="p-2 rounded-full hover:bg-immigo-gray-100">
              <X className="w-6 h-6 text-immigo-gray-600" />
            </button>
          )}
        </header>
        <div className={mainContentClasses}>
          <div className="lg:grid lg:grid-cols-12 gap-8">
            <nav className="lg:col-span-3">
              <ul className="space-y-1">
                <li><button type="button" onClick={() => setActiveView('profile')} className={`w-full text-left flex items-center p-3 rounded-lg font-semibold ${activeView === 'profile' ? 'bg-immigo-gray-200' : 'hover:bg-immigo-gray-200'}`}><User className="w-5 h-5 mr-3 rtl:ml-3 rtl:mr-0" /> {t('account.profile.tab')}</button></li>
                <li><button type="button" onClick={() => setActiveView('security')} className={`w-full text-left flex items-center p-3 rounded-lg font-semibold ${activeView === 'security' ? 'bg-immigo-gray-200' : 'hover:bg-immigo-gray-200'}`}><Lock className="w-5 h-5 mr-3 rtl:ml-3 rtl:mr-0" /> {t('account.security.tab')}</button></li>
                <li><button type="button" onClick={() => setActiveView('connections')} className={`w-full text-left flex items-center p-3 rounded-lg font-semibold ${activeView === 'connections' ? 'bg-immigo-gray-200' : 'hover:bg-immigo-gray-200'}`}><Share2 className="w-5 h-5 mr-3 rtl:ml-3 rtl:mr-0" /> {t('account.connections.tab')}</button></li>
                <li><button type="button" onClick={() => setActiveView('delete')} className={`w-full text-left flex items-center p-3 rounded-lg font-semibold text-art-red-700 ${activeView === 'delete' ? 'bg-art-red-50' : 'hover:bg-art-red-50'}`}><AlertTriangle className="w-5 h-5 mr-3 rtl:ml-3 rtl:mr-0" /> {t('account.delete.tab')}</button></li>
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
