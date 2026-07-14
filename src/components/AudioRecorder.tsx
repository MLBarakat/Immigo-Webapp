import { useMemo } from 'react';
import { TranscriptionState } from '../context/TranscriptionContext';

export interface AudioRecorderProps {
    /** Speculative (interim) text from VAD — shown as translucent grey */
    speculativeText: string;
    /** Committed (final) text verified by Whisper — shown at full opacity */
    committedText: string;
    /** Whether the recording session is currently active */
    isSessionActive: boolean;
    /** Whether the VAD model is loaded and ready */
    vadReady: boolean;
    /** Whether the Whisper model is loading */
    isModelLoading: boolean;
    /** Whisper model load progress 0-100 */
    modelLoadingProgress: number;
    /** Current FSM state label for ARIA and UI feedback */
    fsmState: TranscriptionState;
    /** Whether the background worker is currently executing a matrix inference split */
    isTranscribing: boolean;
    /** Callback to start a new recording session */
    onStart: () => void;
    /** Callback to end the current recording session */
    onStop: () => void;
}

interface RenderToken {
  text: string;
  isSpeculative: boolean;
}

export function AudioRecorder({
    speculativeText,
    committedText,
    isSessionActive,
    vadReady,
    isModelLoading,
    modelLoadingProgress,
    fsmState,
    isTranscribing,
    onStart,
    onStop,
}: AudioRecorderProps): JSX.Element {

    // High-performance token split layout generator. Eliminates heavy DP matrices inside render frames.
    const renderedTokens = useMemo<RenderToken[]>(() => {
        const tokensPool: RenderToken[] = [];

        if (committedText) {
            const committedWords = committedText.split(/\s+/).filter(w => w.length > 0);
            for (let i = 0; i < committedWords.length; i++) {
                tokensPool.push({ text: committedWords[i], isSpeculative: false });
            }
        }

        if (speculativeText) {
            const speculativeWords = speculativeText.split(/\s+/).filter(w => w.length > 0);
            for (let i = 0; i < speculativeWords.length; i++) {
                tokensPool.push({ text: speculativeWords[i], isSpeculative: true });
            }
        }

        return tokensPool;
    }, [committedText, speculativeText]);

    const handleButtonClick = () => {
        if (!vadReady || isModelLoading) return;
        if (isSessionActive) {
            onStop();
        } else {
            onStart();
        }
    };

    const buttonLabel = isSessionActive ? 'Stop Recording' : 'Start Recording';
    const buttonDisabled = isModelLoading || !vadReady || fsmState === 'VERIFYING';

    return (
        <div className="audio-recorder" role="region" aria-label="Speech Transcription UI Window">
            {/* Model loading progress indicator */}
            {isModelLoading && (
                <div
                    className="model-loading-bar"
                    role="progressbar"
                    aria-valuenow={Math.round(modelLoadingProgress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Loading local Whisper model asset graph"
                >
                    <div
                        className="model-loading-fill"
                        style={{ width: `${modelLoadingProgress}%` }}
                    />
                    <span className="model-loading-label">
                        Loading localized intelligence layers… {Math.round(modelLoadingProgress)}%
                    </span>
                </div>
            )}

            {/* Record toggle interaction button container */}
            <button
                id="audio-recorder-toggle"
                onClick={handleButtonClick}
                disabled={buttonDisabled}
                aria-pressed={isSessionActive}
                aria-label={buttonLabel}
                className={`recorder-btn ${isSessionActive ? 'recorder-btn--active' : ''} ${
                    buttonDisabled ? 'recorder-btn--disabled' : ''
                }`}
            >
                <span className="recorder-btn__icon" aria-hidden="true">
                    {isSessionActive ? '⏹' : '🎙'}
                </span>
                <span className="recorder-btn__label">{buttonLabel}</span>
            </button>

            {/* Current Authoritative FSM state indicator hidden cleanly from main layout pool */}
            <span className="sr-only" aria-live="polite" aria-atomic="true">
                Authoritative transcription lifecycle state: {fsmState}
            </span>

            {/*
                FR-016 Compliance: ARIA Polite live region for transcript container text nodes.
                aria-live="polite"   → Announce modifications gently during speech breath boundaries.
                aria-atomic="false"  → Accessibility tools announce newly added tokens exclusively.
                aria-relevant="text" → Filter alerts strictly to character injections.
            */}
            <div
                id="transcript-live-region"
                role="log"
                aria-live="polite"
                aria-atomic="false"
                aria-relevant="text"
                aria-label="Live interactive speech transcript viewport"
                className="transcript-container"
            >
                {renderedTokens.length > 0 ? (
                    <p className="transcript-text">
                        {renderedTokens.map((token, idx) => (
                            <span
                                key={`token-${idx}`}
                                style={{
                                    display: 'inline',
                                    marginRight: '0.25em',
                                    transition: 'opacity 150ms ease-in-out, color 150ms ease-in-out',
                                    // FR-010 Enforced Opacity styling thresholds
                                    opacity: token.isSpeculative ? 0.70 : 1.0,
                                    color: token.isSpeculative ? 'rgba(75, 85, 99, 0.7)' : 'var(--color-text-primary, #1f2937)',
                                    animation: token.isSpeculative ? 'token-slide-up 150ms ease-out' : 'none'
                                }}
                            >
                                {token.text}
                            </span>
                        ))}
                        {/* High-fidelity pulsing processing indicator dot during active verification */}
                        {isTranscribing && (
                            <span className="transcribing-pulsing-dot" aria-label="Whisper ledger verifying chunk" />
                        )}
                    </p>
                ) : (
                    <p className="transcript-placeholder" aria-hidden="true">
                        {isSessionActive ? 'Listening for speech onset envelope…' : 'Initialize a secure session to begin speaking'}
                    </p>
                )}
            </div>

            {/* CSS styles injected inline to preserve portability across compilation bundles */}
            <style>{`
                @keyframes token-slide-up {
                    from { opacity: 0; transform: translateY(3px); }
                    to   { opacity: 0.7; transform: translateY(0); }
                }
                @keyframes pulsing-glow {
                    0% { opacity: 0.3; transform: scale(0.9); }
                    50% { opacity: 1.0; transform: scale(1.1); }
                    100% { opacity: 0.3; transform: scale(0.9); }
                }
                .transcript-container {
                    min-height: 4em;
                    padding: 0.85rem 1.25rem;
                    border-radius: 0.5rem;
                    background: var(--color-surface, rgba(255,255,255,0.04));
                    border: 1px solid var(--color-border, rgba(0,0,0,0.05));
                    line-height: 1.6;
                    margin-top: 1rem;
                }
                .transcript-text {
                    margin: 0;
                    font-size: 1rem;
                    word-break: break-word;
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                }
                .transcribing-pulsing-dot {
                    display: inline-block;
                    width: 8px;
                    height: 8px;
                    margin-left: 0.5em;
                    border-radius: 50%;
                    background-color: var(--color-accent, #6366f1);
                    animation: pulsing-glow 1.2s infinite ease-in-out;
                }
                .transcript-placeholder {
                    margin: 0;
                    color: var(--color-muted, #9ca3af);
                    font-style: italic;
                }
                .recorder-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.6rem 1.25rem;
                    border-radius: 9999px;
                    font-weight: 600;
                    font-size: 0.95rem;
                    border: 2px solid currentColor;
                    background: transparent;
                    color: var(--color-text-primary, #374151);
                    cursor: pointer;
                    transition: all 150ms ease;
                }
                .recorder-btn:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                }
                .recorder-btn--disabled {
                    opacity: 0.4;
                    cursor: not-allowed !important;
                    transform: none !important;
                    box-shadow: none !important;
                }
                .recorder-btn--active {
                    background: var(--color-error, #ef4444);
                    color: white;
                    border-color: var(--color-error, #ef4444);
                }
                .model-loading-bar {
                    position: relative;
                    height: 6px;
                    background: var(--color-border, #e5e7eb);
                    border-radius: 3px;
                    margin-bottom: 1rem;
                    overflow: hidden;
                }
                .model-loading-fill {
                    height: 100%;
                    background: var(--color-accent, #6366f1);
                    transition: width 200ms ease;
                }
                .model-loading-label {
                    position: absolute;
                    top: 10px;
                    left: 0;
                    font-size: 0.75rem;
                    font-weight: 500;
                    color: var(--color-muted, #6b7280);
                }
                .sr-only {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    padding: 0;
                    margin: -1px;
                    overflow: hidden;
                    clip: rect(0,0,0,0);
                    border: 0;
                }
            `}</style>
        </div>
    );
}