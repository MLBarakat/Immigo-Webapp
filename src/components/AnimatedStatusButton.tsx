import { AppStatus } from '../context/ConversationContext';
import { useEffect, useRef, useState } from 'react';

interface AnimatedStatusButtonProps {
  readonly status: AppStatus;
}

// Sub-components for each animation state
function IdleAnimation() {
  const BaseMicIcon = ({ className }: { className?: string }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"></path>
      <path d="M19 10v1a7 7 0 11-14 0v-1"></path>
      <line x1="12" y1="19" x2="12" y2="23"></line>
      <line x1="8" y1="23" x2="16" y2="23"></line>
    </svg>
  );

  return (
    <div className="w-full h-full text-art-blue-300 flex items-center justify-center">
      <div className="w-2/3 h-2/3 relative">
        <svg className="absolute w-full h-full" viewBox="0 0 24 24">
          <defs>
            <clipPath id="mic-clip-idle">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"></path>
            </clipPath>
          </defs>
          <g clipPath="url(#mic-clip-idle)">
            <rect className="liquid-wave" x="-10" y="0" width="44" height="24" fill="currentColor" />
          </g>
        </svg>
        <BaseMicIcon className="relative w-full h-full" />
      </div>
    </div>
  );
}

function ListeningAnimation() {
  return (
    <div className="w-full h-full flex justify-center items-center gap-1.5 text-art-blue-300">
      <div className="w-1.5 h-1/3 bg-current rounded-full waveform-bar" style={{ animationDelay: '0s' }}></div>
      <div className="w-1.5 h-1/2 bg-current rounded-full waveform-bar" style={{ animationDelay: '0.2s' }}></div>
      <div className="w-1.5 h-3/4 bg-current rounded-full waveform-bar" style={{ animationDelay: '0.4s' }}></div>
      <div className="w-1.5 h-2/5 bg-current rounded-full waveform-bar" style={{ animationDelay: '0.6s' }}></div>
      <div className="w-1.5 h-2/3 bg-current rounded-full waveform-bar" style={{ animationDelay: '0.8s' }}></div>
    </div>
  );
}

function ProcessingAnimation() {
    return (
        <div className="w-full h-full flex items-center justify-center text-art-blue-300 intro-hourglass">
            <svg viewBox="0 0 100 100" className="w-full h-full">
                <circle cx="50" cy="50" r="4" fill="currentColor" opacity="0.8" />
                <circle cx="50" cy="50" r="35" stroke="currentColor" strokeWidth="1" opacity="0.3" fill="none" />
                <g transform="translate(50, 50)">
                    {[...Array(8)].map((_, i) => (
                        <circle key={i} cx="0" cy="0" r="3" fill="currentColor" className="gravity-particle" style={{ animationDelay: `${i * 0.375}s` }} />
                    ))}
                </g>
            </svg>
        </div>
    );
}

function SpeakingAnimation() {
    return (
        <div className="w-full h-full flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-full h-full text-art-blue-300 orb intro-orb">
                <defs>
                    <pattern id="grid" width="8" height="8" patternUnits="userSpaceOnUse">
                        <circle cx="1" cy="1" r="0.5" fill="currentColor" opacity="0.7" />
                    </pattern>
                </defs>
                <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <g className="orb-surface" style={{ transformOrigin: '50% 50%' }}>
                    <circle cx="50" cy="50" r="44" fill="url(#grid)" />
                </g>
            </svg>
        </div>
    );
}
function ErrorAnimation() {
    const ref = useRef<HTMLDivElement>(null);
    const [isGlitching, setIsGlitching] = useState(false);

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return;
            const line = entry.target.querySelector('.scanline');
            if (line) {
                const listener = () => {
                    setIsGlitching(true);
                    setTimeout(() => setIsGlitching(false), 200);
                };
                line.addEventListener('animationiteration', listener);
                return () => {
                    line.removeEventListener('animationiteration', listener);
                };
            }
        });

        if (ref.current) {
            observer.observe(ref.current);
        }

        return () => observer.disconnect();
    }, []);

    return (
        <div ref={ref} className={`w-full h-full relative flex items-center justify-center scan-target ${isGlitching ? 'is-glitching' : ''}`}>
            <svg viewBox="0 0 100 100" className="w-2/3 h-2/3 text-immigo-gray-400 intro-error">
                <path d="M50,10 A40,40 0 1,1 49.9,10.001 M50,30 L50,55 M50,65 L50,70" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" />
            </svg>
            <div className="scanline"></div>
        </div>
    );
}


const STATUS_MAP: Record<AppStatus, { component: JSX.Element; color: string }> = {
  idle: { component: <IdleAnimation />, color: 'border-art-blue-300' },
  listening: { component: <ListeningAnimation />, color: 'border-art-blue-300' },
  processing: { component: <ProcessingAnimation />, color: 'border-art-blue-300' },
  speaking: { component: <SpeakingAnimation />, color: 'border-art-blue-300' },
  error: { component: <ErrorAnimation />, color: 'border-art-red-600' },
};


export function AnimatedStatusButton({ status }: AnimatedStatusButtonProps): JSX.Element {
    const { component, color } = STATUS_MAP[status] ?? STATUS_MAP['idle'];

    return (
        <div
            className={`
                w-full h-full aspect-square rounded-full bg-star-white backdrop-blur-sm
                border-3 ${color}
                shadow-2xl shadow-black/30
                flex items-center justify-center
                transition-colors duration-500 p-4
            `}
        >
            <div className="w-full h-full status-enter-active">{component}</div>
        </div>
    );
}