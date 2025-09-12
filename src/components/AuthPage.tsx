import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ImmigoLogo from '../assets/immigo_logo.png';
import { TermsModal } from './TermsModal';
import { User, Mail, KeyRound, Globe, CheckSquare, Square } from 'lucide-react';

export const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [promoEmails, setPromoEmails] = useState(false);
  const [newsletter, setNewsletter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLogin &&!agreedToTerms) {
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
        alert('Check your email for the confirmation link to complete your registration!');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
      <div className="min-h-screen bg-gradient-to-br from-immigo-gray-50 via-star-white to-immigo-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-star-white p-8 rounded-2xl shadow-2xl border border-immigo-gray-200">
          <div className="text-center mb-8">
            <img src={ImmigoLogo} alt="Immigo Logo" className="w-24 h-24 mx-auto object-contain mb-4 drop-shadow-lg" />
            <h1 className="text-4xl font-extrabold font-display bg-gradient-to-r from-art-red-700 via-art-blue-700 to-deep-navy bg-clip-text text-transparent drop-shadow-lg">
              {isLogin? 'Welcome Back' : 'Create Your Account'}
            </h1>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-immigo-gray-500" />
                <input type="text" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full p-3 pl-10 border-2 border-immigo-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-art-blue-500" required />
              </div>
            )}
            <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-immigo-gray-500" />
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 pl-10 border-2 border-immigo-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-art-blue-500" required />
            </div>
            <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-immigo-gray-500" />
                <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 pl-10 border-2 border-immigo-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-art-blue-500" required />
            </div>
            {!isLogin && (
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-immigo-gray-500" />
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full p-3 pl-10 border-2 border-immigo-gray-300 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-art-blue-500">
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="es-ES">Spanish</option>
                  <option value="fr-FR">French</option>
                  <option value="de-DE">German</option>
                </select>
              </div>
            )}
            {!isLogin && (
              <div className="space-y-3 pt-2">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input type="checkbox" checked={promoEmails} onChange={(e) => setPromoEmails(e.target.checked)} className="hidden" />
                  {promoEmails? <CheckSquare className="w-5 h-5 text-art-blue-600" /> : <Square className="w-5 h-5 text-immigo-gray-400" />}
                  <span className="text-sm text-immigo-gray-700">Receive promotional emails and updates.</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="hidden" />
                  {agreedToTerms? <CheckSquare className="w-5 h-5 text-art-blue-600" /> : <Square className="w-5 h-5 text-immigo-gray-400" />}
                  <span className="text-sm text-immigo-gray-700">
                    I agree to the <button type="button" onClick={() => setShowTerms(true)} className="font-semibold text-art-blue-600 hover:underline">Terms and Conditions</button>.
                  </span>
                </label>
              </div>
            )}
            {error && <p className="text-art-red-600 text-sm text-center pt-2">{error}</p>}
            <button type="submit" disabled={loading} className="w-full p-3 bg-art-blue-600 text-star-white font-bold rounded-lg shadow-md hover:bg-art-blue-700 disabled:bg-immigo-gray-400 mt-4">
              {loading? 'Processing...' : isLogin? 'Login' : 'Sign Up'}
            </button>
          </form>
          <p className="text-center mt-6 text-sm text-immigo-gray-600">
            {isLogin? "Don't have an account?" : 'Already have an account?'}
            <button onClick={() => { setIsLogin(!isLogin); setError(null); }} className="font-bold text-art-blue-600 hover:underline ml-1">
              {isLogin? 'Sign Up' : 'Login'}
            </button>
          </p>
        </div>
      </div>
    </>
  );
};
