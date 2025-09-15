import React from 'react';
import { ArrowLeft } from 'lucide-react';

// This would be a placeholder. In a real app, you'd use a router.
const onNavigateBack = () => alert("Navigating back...");

export const AccountSettingsPage: React.FC = () => {
  return (
    <div className="h-screen w-screen bg-immigo-gray-100 flex flex-col font-sans">
        <header className="bg-star-white shadow-md border-b border-immigo-gray-200 p-4 flex-shrink-0 z-10">
            <button onClick={onNavigateBack} className="flex items-center font-semibold text-deep-navy">
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back to App
            </button>
        </header>
        <div className="flex-1 p-6">
            <h1 className="text-3xl font-bold mb-6 text-deep-navy">Account Settings</h1>
            <div className="lg:grid lg:grid-cols-12 gap-6">
                <nav className="lg:col-span-3">
                    <ul className="space-y-1">
                        <li><a href="#" className="block p-3 rounded-lg bg-immigo-gray-200 font-semibold">My Profile</a></li>
                        <li><a href="#" className="block p-3 rounded-lg hover:bg-immigo-gray-200">Security & Login</a></li>
                        <li><a href="#" className="block p-3 rounded-lg hover:bg-immigo-gray-200">Social Connections</a></li>
                        <li><a href="#" className="block p-3 rounded-lg text-art-red-700 hover:bg-art-red-50">Delete My Account</a></li>
                    </ul>
                </nav>
                <main className="lg:col-span-9 mt-6 lg:mt-0">
                    <div className="bg-star-white p-6 rounded-lg shadow">
                        <h2 className="text-xl font-bold text-deep-navy">My Profile</h2>
                        <p className="text-sm text-immigo-gray-600 mb-4">Update your name, email, and profile picture.</p>
                        {/* Form fields would go here */}
                    </div>
                </main>
            </div>
        </div>
    </div>
  );
};