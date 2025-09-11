import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ImmigoLogo from '../assets/immigo_logo.png';

export const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signUp(email, password);
        alert('Check your email for the confirmation link!');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-gradient-to-br from-immigo-gray-50 via-star-white to-immigo-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-star-white p-8 rounded-2xl shadow-2xl border border-immigo-gray-200">
        <div className="text-center mb-8">
          <img src={ImmigoLogo} alt="Immigo Logo" className="w-24 h-24 mx-auto object-contain mb-4 drop-shadow-lg" />
          <h1 className="text-4xl font-extrabold font-display bg-gradient-to-r from-art-red-700 via-art-blue-700 to-deep-navy bg-clip-text text-transparent drop-shadow-lg">
            {isLogin? 'Welcome Back' : 'Create Account'}
          </h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 border-2 border-immigo-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-art-blue-500"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 border-2 border-immigo-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-art-blue-500"
            required
          />
          {error && <p className="text-art-red-600 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full p-3 bg-art-blue-600 text-star-white font-bold rounded-lg shadow-md hover:bg-art-blue-700 disabled:bg-immigo-gray-400"
          >
            {loading? 'Processing...' : isLogin? 'Login' : 'Sign Up'}
          </button>
        </form>
        <p className="text-center mt-6 text-sm text-immigo-gray-600">
          {isLogin? "Don't have an account?" : 'Already have an account?'}
          <button onClick={() => setIsLogin(!isLogin)} className="font-bold text-art-blue-600 hover:underline ml-1">
            {isLogin? 'Sign Up' : 'Login'}
          </button>
        </p>
      </div>
    </div>
  );
};
