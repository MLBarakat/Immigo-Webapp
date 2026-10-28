import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import ImmigoLogo from '../assets/immigo_logo.svg';
import { TermsModal } from './TermsModal';
import { PrivacyModal } from './PrivacyModal';
import { TERMS_VERSION } from '../legal/terms-content';
import { PRIVACY_VERSION } from '../legal/privacy-content';
import { User, Mail, KeyRound, Globe, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { PasswordStrengthChecker } from './PasswordStrengthChecker';
import { isPasswordValid } from '../utils/passwordStrength';
import { SUPPORTED_LANGUAGES } from '../constants';
import { Language } from '../types/language';
import { ImmiGOLabel } from './ImmiGOLabel';
import i18n, { applyLanguageDirection } from '../i18n';
import { getDefaultTimeZoneForState, US_STATES, getTimeZoneLabel } from '../utils/usLocation';

export function AuthPage(): JSX.Element {
  const { t } = useTranslation('common');
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [language, setLanguage] = useState(() => i18n.language || 'en-US');
  const [locationState, setLocationState] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const { login, signUp } = useAuth();

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    void i18n.changeLanguage(newLanguage);
    applyLanguageDirection(newLanguage);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLogin && !agreedToTerms) {
      setError(t('auth.errorMustAgree'));
      return;
    }
    if (!isLogin && !isPasswordValid(password)) {
      setError(t('auth.errorPasswordRequirements'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signUp({
          email,
          password,
          fullName,
          language,
          locationState,
          accountTimezone: getDefaultTimeZoneForState(locationState),
          termsAcceptedAt: new Date().toISOString(),
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
        });
        setSignUpSuccess(true);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t('auth.errorUnexpected'));
      }
    } finally {
      setLoading(false);
    }
  };

  // Intercept the UI with a confirmation view state if account creation succeeds
  if (signUpSuccess) {
    return (
      <div className="min-h-dvh w-full bg-immigo-gray-50 flex items-center justify-center p-4 lg:p-6">
        <div className="w-full max-w-md bg-star-white p-8 lg:p-10 rounded-2xl shadow-xl border border-immigo-gray-200 text-center">
          <header className="flex flex-col items-center justify-center mb-6">
            <div className="flex items-center justify-center mb-4">
              <img src={ImmigoLogo} alt="ImmiGo Logo" className="h-16 w-16 lg:h-20 lg:w-20 object-contain" />
              <ImmiGOLabel className="flex font-bold text-5xl lg:text-6xl" />
            </div>
            <h1 className="text-2xl font-bold text-deep-navy font-display">{t('auth.accountCreated.title')}</h1>
            <p className="text-immigo-gray-600 mt-3 text-sm leading-relaxed">
              {t('auth.accountCreated.message', { email })}
            </p>
          </header>
          <button
            type="button"
            onClick={() => { setIsLogin(true); setSignUpSuccess(false); setError(null); }}
            className="w-full py-3 bg-art-blue-600 text-star-white font-bold rounded-lg shadow-md hover:bg-art-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-art-blue-500"
          >
            {t('auth.accountCreated.backToLogin')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
      <div className="min-h-dvh w-full bg-immigo-gray-50 flex items-center justify-center p-4 lg:p-6">
        <div className="w-full max-w-md bg-star-white p-8 lg:p-10 rounded-2xl shadow-xl border border-immigo-gray-200">
          <header className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <img src={ImmigoLogo} alt="ImmiGo Logo" className="h-16 w-16 lg:h-20 lg:w-20 object-contain" />
              <ImmiGOLabel className="flex font-bold text-5xl lg:text-6xl" />
            </div>
            <h1 className="text-2xl font-bold text-deep-navy font-display">
              {isLogin ? t('auth.loginTitle') : t('auth.signupTitle')}
            </h1>
            <p className="text-immigo-gray-600 mt-2">
              {isLogin ? t('auth.loginSubtitle') : t('auth.signupSubtitle')}
            </p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="relative">
                <label htmlFor="full-name" className="sr-only">{t('auth.fullName')}</label>
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-immigo-gray-400" aria-hidden="true" />
                <input id="full-name" data-testid="auth-fullname" type="text" placeholder={t('auth.fullName')} value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full py-3 pl-12 pr-4 border border-immigo-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-art-blue-500 transition-shadow" required />
              </div>
            )}
            <div className="relative">
              <label htmlFor="email" className="sr-only">{t('auth.email')}</label>
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-immigo-gray-400" aria-hidden="true" />
              <input id="email" data-testid="auth-email" type="email" autoComplete="username" placeholder={t('auth.email')} value={email} onChange={(e) => setEmail(e.target.value)} className="w-full py-3 pl-12 pr-4 border border-immigo-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-art-blue-500 transition-shadow" required />
            </div>
            <div>
              <div className="relative">
                <label htmlFor="password" className="sr-only">{t('auth.password')}</label>
                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-immigo-gray-400" aria-hidden="true" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  placeholder={t('auth.password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full py-3 pl-12 pr-12 border border-immigo-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-art-blue-500 transition-shadow"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={t(showPassword ? 'passwordVisibility.hide' : 'passwordVisibility.show')}
                  aria-controls="password"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-immigo-gray-500 hover:text-immigo-gray-700 focus:outline-none focus:ring-2 focus:ring-art-blue-500"
                >
                  {showPassword
                    ? <EyeOff className="w-5 h-5" aria-hidden="true" />
                    : <Eye className="w-5 h-5" aria-hidden="true" />}
                </button>
              </div>
              {!isLogin && <PasswordStrengthChecker password={password} />}
            </div>
            {!isLogin && (
              <>
                <div className="relative">
                  <label htmlFor="language" className="sr-only">{t('auth.primaryLanguage')}</label>
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-immigo-gray-400" aria-hidden="true" />
                  <select id="language" value={language} onChange={(e) => handleLanguageChange(e.target.value)} className="w-full py-3 pl-12 pr-4 border border-immigo-gray-300 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-art-blue-500 transition-shadow">
                    {SUPPORTED_LANGUAGES.map((lang: Language) => (
                      <option key={lang.code} value={lang.code}>{lang.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="signup-location" className="block text-sm font-medium text-immigo-gray-700 mb-1">{t('auth.locationState')}</label>
                  <select
                    id="signup-location"
                    data-testid="auth-location-state"
                    value={locationState}
                    onChange={(e) => setLocationState(e.target.value)}
                    className="w-full py-3 px-4 border border-immigo-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-art-blue-500 transition-shadow"
                    required
                  >
                    <option value="">{t('auth.selectState')}</option>
                    {US_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                  {locationState && (
                    <p className="mt-1 text-xs text-immigo-gray-600">
                      {t('auth.sessionTimezoneDefault', { timeZone: getTimeZoneLabel(getDefaultTimeZoneForState(locationState), language) })}
                    </p>
                  )}
                </div>
                <div className="pt-2">
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300 text-art-blue-600 focus:ring-art-blue-500" />
                    <span className="text-sm text-immigo-gray-700">
                      I am 18 or older and a U.S. resident, and I agree to the <button type="button" onClick={() => setShowTerms(true)} className="font-semibold text-art-blue-600 hover:underline focus:outline-none">Terms of Service</button> and <button type="button" onClick={() => setShowPrivacy(true)} className="font-semibold text-art-blue-600 hover:underline focus:outline-none">Privacy Policy</button>.
                    </span>
                  </label>
                </div>
              </>
            )}

            {error && (
              <div role="alert" className="flex items-center text-art-red-600 text-sm p-3 bg-art-red-50 rounded-lg">
                <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" data-testid="auth-submit" disabled={loading} className="w-full py-3 bg-art-blue-600 text-star-white font-bold rounded-lg shadow-md hover:bg-art-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-art-blue-500">
              {loading ? t('auth.processing') : isLogin ? t('auth.login') : t('auth.createAccount')}
            </button>
          </form>

          <footer className="text-center mt-8">
            <p className="text-sm text-immigo-gray-600">
              {isLogin ? t('auth.noAccount') : t('auth.haveAccount')}
              <button onClick={() => { setIsLogin(!isLogin); setError(null); }} className="font-bold text-art-blue-600 hover:underline ml-1 focus:outline-none">
                {isLogin ? t('auth.signUp') : t('auth.login')}
              </button>
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}

