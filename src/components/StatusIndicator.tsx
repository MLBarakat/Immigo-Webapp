import React from 'react';
import { Mic, MicOff, MessageSquare, Volume2, AlertCircle, Loader, Waves } from 'lucide-react';
import { AppStatus } from '../types/conversation';

interface StatusIndicatorProps {
  status: AppStatus;
  errorMessage?: string | null;
}

const statusConfig = {
  idle: {
    icon: MicOff,
    label: 'Ready',
    color: 'text-slate-600',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    glowColor: '',
  },
  listening: {
    icon: Waves,
    label: 'Listening...',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    glowColor: 'shadow-blue-200',
    animated: true,
  },
  processing: {
    icon: Loader,
    label: 'Processing...',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    glowColor: 'shadow-red-200',
    animated: true,
  },
  speaking: {
    icon: Volume2,
    label: 'AI Speaking...',
    color: 'text-blue-800',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-400',
    glowColor: 'shadow-blue-300',
    animated: true,
  },
  error: {
    icon: AlertCircle,
    label: 'Error',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-400',
    glowColor: 'shadow-red-200',
  },
};

export function StatusIndicator({ status, errorMessage }: StatusIndicatorProps) {
  const config = statusConfig[status];
  const IconComponent = config.icon;

  return (
    <div className="flex flex-col items-center space-y-4">
      <div
        className={`relative flex items-center justify-center w-20 h-20 rounded-full border-3 ${config.bgColor} ${config.borderColor} ${config.glowColor} transition-all duration-500 ${config.animated ? 'shadow-lg animate-pulse' : 'shadow-md'}`}
      >
        <IconComponent
          className={`w-10 h-10 ${config.color} ${config.animated ? 'animate-bounce' : ''}`}
        />
        {config.animated && (
          <div className={`absolute inset-0 rounded-full border-3 ${config.borderColor} animate-ping opacity-20`} />
        )}
      </div>
      
      <div className="text-center">
        <p className={`text-base font-semibold ${config.color} tracking-wide`}>
          {config.label}
        </p>
        
        {status === 'error' && errorMessage && (
          <p className="text-sm text-red-600 mt-2 max-w-xs mx-auto font-medium bg-red-50 px-3 py-1 rounded-lg border border-red-200">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}