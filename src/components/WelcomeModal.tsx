import React, { useState } from 'react';
import { Hand, Mic, MessageSquare, Zap, ArrowRight, X } from 'lucide-react';

interface WelcomeModalProps {
  userName: string;
  onClose: () => void;
}

const steps = [
  {
    icon: Mic,
    title: "Start Your Session",
    description: "Press the large animated button to start a practice session. The AI will greet you and wait for you to speak.",
  },
  {
    icon: MessageSquare,
    title: "Speak Naturally",
    description: "When the AI is listening, just speak as you would in a normal conversation. Your words will be transcribed in real-time.",
  },
  {
    icon: Zap,
    title: "Pro Tip: Interrupt Anytime!",
    description: "This is just like a real conversation. You can interrupt the AI at any point by simply starting to speak.",
  },
];

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ userName, onClose }) => {
  const [step, setStep] = useState(0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 transition-opacity duration-300">
      <div className="bg-star-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col transform transition-all duration-300 scale-95 animate-scale-in">
        <header className="flex items-center justify-between p-4 border-b border-immigo-gray-200">
            <div className="flex items-center gap-3">
                <Hand className="w-6 h-6 text-art-blue-600" />
                <h2 className="text-xl font-bold text-deep-navy font-display">Welcome, {userName}!</h2>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-immigo-gray-100 transition-colors">
                <X className="w-5 h-5 text-immigo-gray-600" />
            </button>
        </header>

        <main className="p-8 text-center">
            <div className="w-16 h-16 bg-art-blue-100 text-art-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <steps[step].icon className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-deep-navy mb-2">{steps[step].title}</h3>
            <p className="text-immigo-gray-600 min-h-[72px]">{steps[step].description}</p>
        </main>

        <footer className="p-6 bg-immigo-gray-50 rounded-b-2xl flex items-center justify-between">
            <div className="flex gap-2">
                {steps.map((_, index) => (
                    <button
                        key={index}
                        onClick={() => setStep(index)}
                        className={`w-2 h-2 rounded-full ${index === step ? 'bg-art-blue-600' : 'bg-immigo-gray-300 hover:bg-immigo-gray-400'}`}
                        aria-label={`Go to step ${index + 1}`}
                    />
                ))}
            </div>
            {step < steps.length - 1 ? (
                <button
                    onClick={() => setStep(s => s + 1)}
                    className="flex items-center gap-2 px-5 py-2 bg-art-blue-600 text-star-white font-bold rounded-lg shadow-md hover:bg-art-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-art-blue-500 transition-transform transform hover:scale-105"
                >
                    Next <ArrowRight className="w-5 h-5" />
                </button>
            ) : (
                <button
                    onClick={onClose}
                    className="px-5 py-2 bg-art-blue-600 text-star-white font-bold rounded-lg shadow-md hover:bg-art-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-art-blue-500 transition-transform transform hover:scale-105"
                >
                    Let's Get Started
                </button>
            )}
        </footer>
      </div>
    </div>
  );
};