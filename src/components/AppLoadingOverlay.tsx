// src/components/AppLoadingOverlay.tsx
import React from 'react';

interface AppLoadingOverlayProps {
    isModelLoading: boolean;
    modelLoadingProgress: number;
}

const AppLoadingOverlay: React.FC<AppLoadingOverlayProps> = ({ isModelLoading, modelLoadingProgress }) => {
    if (!isModelLoading) {
        return null;
    }

    const bars = Array.from({ length: 5 });

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-80 backdrop-blur-sm flex flex-col items-center justify-center z-50 transition-opacity duration-300">
            <div className="text-white text-2xl font-bold mb-4">Initializing ImmiGO App...</div>
            
            {/* Waveform Animation */}
            <div className="flex items-center justify-center space-x-2 h-10">
                {bars.map((_, i) => (
                    <div
                        key={i}
                        className="w-2 bg-blue-500 rounded-full"
                        style={{
                            height: '100%',
                            animation: `wave 1.2s ease-in-out infinite`,
                            animationDelay: `${i * 0.2}s`,
                        }}
                    ></div>
                ))}
            </div>

            {/* Progress Text */}
            <div className="text-white text-lg mt-4">{Math.round(modelLoadingProgress)} %</div>
            <div className="text-gray-400 text-sm mt-2">Please wait, this may take a moment on your first visit.</div>
        </div>
    );
};

export default AppLoadingOverlay;
