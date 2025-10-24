import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import ImmigoLogo from '../assets/immigo_logo.svg';
import { TermsModal } from './TermsModal';
import { User, Mail, KeyRound, Globe, AlertCircle } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from './LanguageSelector';
import { ImmiGOLabel } from './ImmiGOLabel';

export function AuthPage(): JSX.Element {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);
  const { login, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLogin && !agreedToTerms) {
      setError("You must agree to the Terms and Conditions to sign up.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signUp({ email, password, fullName, language });
        // Instead of an alert, we can handle this state in the UI in a future sprint
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
      <div className="min-h-dvh w-full bg-immigo-gray-50 flex items-center justify-center p-4 lg:p-6">
        <div className="w-full max-w-md bg-star-white p-8 lg:p-10 rounded-2xl shadow-xl border border-immigo-gray-200">
          <header className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <img src={ImmigoLogo} alt="ImmiGo Logo" className="h-16 w-16 lg:h-20 lg:w-20 object-contain" />
              <ImmiGOLabel className="flex font-bold text-5xl lg:text-6xl" />
            </div>
            <h1 className="text-2xl font-bold text-deep-navy font-display">
              {isLogin ? 'Welcome Back' : 'Create Your Account'}
            </h1>
            <p className="text-immigo-gray-600 mt-2">
              {isLogin ? 'Sign in to continue your journey.' : 'Get started with your personal AI coach.'}
            </p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="relative">
                <label htmlFor="full-name" className="sr-only">Full Name</label>
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-immigo-gray-400" aria-hidden="true" />
                <input id="full-name" type="text" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full py-3 pl-12 pr-4 border border-immigo-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-art-blue-500 transition-shadow" required />
              </div>
            )}
            <div className="relative">
              <label htmlFor="email" className="sr-only">Email Address</label>
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-immigo-gray-400" aria-hidden="true" />
              <input id="email" type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full py-3 pl-12 pr-4 border border-immigo-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-art-blue-500 transition-shadow" required />
            </div>
            <div className="relative">
              <label htmlFor="password" className="sr-only">Password</label>
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-immigo-gray-400" aria-hidden="true" />
              <input id="password" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full py-3 pl-12 pr-4 border border-immigo-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-art-blue-500 transition-shadow" required />
            </div>
            {!isLogin && (
              <>
                <div className="relative">
                  <label htmlFor="language" className="sr-only">Primary Language</label>
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-immigo-gray-400" aria-hidden="true" />
                  <select id="language" value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full py-3 pl-12 pr-4 border border-immigo-gray-300 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-art-blue-500 transition-shadow">
                    {SUPPORTED_LANGUAGES.map((lang: any) => (
                      <option key={lang.code} value={lang.code}>{lang.name}</option>
                    ))}
                  </select>
                </div>
                <div className="pt-2">
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300 text-art-blue-600 focus:ring-art-blue-500" />
                    <span className="text-sm text-immigo-gray-700">
                      I agree to the <button type="button" onClick={() => setShowTerms(true)} className="font-semibold text-art-blue-600 hover:underline focus:outline-none">Terms and Conditions</button>.
                    </span>
                  </label>
                </div>
              </>
            )}

            {error && (
              <div className="flex items-center text-art-red-600 text-sm p-3 bg-art-red-50 rounded-lg">
                <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="w-full py-3 bg-art-blue-600 text-star-white font-bold rounded-lg shadow-md hover:bg-art-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-art-blue-500">
              {loading ? 'Processing...' : isLogin ? 'Login' : 'Create Account'}
            </button>
          </form>

          <footer className="text-center mt-8">
            <p className="text-sm text-immigo-gray-600">
              {isLogin ? "Don't have an account?" : 'Already have an account?'}
              <button onClick={() => { setIsLogin(!isLogin); setError(null); }} className="font-bold text-art-blue-600 hover:underline ml-1 focus:outline-none">
                {isLogin ? 'Sign Up' : 'Login'}
              </button>
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}