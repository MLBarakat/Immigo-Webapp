// src/components/AudioRecorder.tsx
// T009: Record click interactions, state changes, and speculative text render blocks.
// T018: Connect token diff coordinate targets to DOM rendering with CSS transitions.
// T019: Apply ARIA Polite live region attributes on transcript container.

import React, { useMemo } from 'react';
import { diffTokens, type DiffResult } from '../utils/diffReconciliation';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AudioRecorderProps {
    /** Speculative (interim) text from VAD — shown as translucent grey */
    speculativeText: string;
    /** Committed (final) text verified by Whisper — shown at full opacity */
    committedText: string;
    /** Whether the recording session is currently active */
    isSessionActive: boolean;
    /** Whether the VAD model is loaded and ready */
    vadReady: boolean;
    /** Whether the Whisper model is loaded */
    isModelLoading: boolean;
    /** Whisper model load progress 0-100 */
    modelLoadingProgress: number;
    /** Current FSM state label for ARIA and UI feedback */
    fsmState: string;
    /** Callback to start a new recording session */
    onStart: () => void;
    /** Callback to end the current recording session */
    onStop: () => void;
}

// ─── Token Render Component ───────────────────────────────────────────────────

interface TokenSpanProps {
    result: DiffResult;
    index: number;
}

/**
 * Renders a single token span with CSS opacity transition.
 *
 * Token classification:
 *   unchanged  → full opacity (1.0)
 *   insert     → slides in with fade (opacity 0 → 1) via CSS animation
 *   delete     → rendered as nothing (handled by diffTokens filtering)
 *   substitute → cross-fade: old text fades out, new text fades in
 *   speculative → translucent grey (opacity 0.45)
 */
function TokenSpan({ result, index }: TokenSpanProps): JSX.Element {
    const baseStyle: React.CSSProperties = {
        display: 'inline',
        marginRight: '0.25em',
        transition: 'opacity 180ms ease-in-out, color 180ms ease-in-out',
    };

    if (result.type === 'unchanged') {
        return (
            <span
                key={`unchanged-${index}`}
                style={{ ...baseStyle, opacity: 1 }}
            >
                {result.token}
            </span>
        );
    }

    if (result.type === 'insert') {
        return (
            <span
                key={`insert-${index}`}
                style={{ ...baseStyle, opacity: 1, animation: 'token-fade-in 180ms ease-in-out' }}
            >
                {result.token}
            </span>
        );
    }

    if (result.type === 'substitute') {
        return (
            <span
                key={`substitute-${index}`}
                style={{ ...baseStyle, opacity: 1, animation: 'token-fade-in 180ms ease-in-out' }}
            >
                {result.token}
            </span>
        );
    }

    if (result.type === 'speculative') {
        return (
            <span
                key={`speculative-${index}`}
                style={{ ...baseStyle, opacity: 0.45, color: 'var(--color-speculative, #6b7280)' }}
            >
                {result.token}
            </span>
        );
    }

    // delete tokens are not rendered in the output view
    return <></>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AudioRecorder({
    speculativeText,
    committedText,
    isSessionActive,
    vadReady,
    isModelLoading,
    modelLoadingProgress,
    fsmState,
    onStart,
    onStop,
}: AudioRecorderProps): JSX.Element {

    // T018: Compute token-level diff between committed and speculative text
    const tokenDiff = useMemo<DiffResult[]>(() => {
        if (!speculativeText && !committedText) return [];
        return diffTokens(committedText, speculativeText);
    }, [committedText, speculativeText]);

    const handleButtonClick = () => {
        if (!vadReady) return;
        if (isSessionActive) {
            onStop();
        } else {
            onStart();
        }
    };

    const buttonLabel = isSessionActive ? 'Stop Recording' : 'Start Recording';
    const buttonDisabled = isModelLoading || !vadReady;

    return (
        <div className="audio-recorder" role="region" aria-label="Speech Transcription">
            {/* Model loading indicator */}
            {isModelLoading && (
                <div
                    className="model-loading-bar"
                    role="progressbar"
                    aria-valuenow={Math.round(modelLoadingProgress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Loading Whisper model"
                >
                    <div
                        className="model-loading-fill"
                        style={{ width: `${modelLoadingProgress}%` }}
                    />
                    <span className="model-loading-label">
                        Loading model… {Math.round(modelLoadingProgress)}%
                    </span>
                </div>
            )}

            {/* Record / Stop button */}
            <button
                id="audio-recorder-toggle"
                onClick={handleButtonClick}
                disabled={buttonDisabled}
                aria-pressed={isSessionActive}
                aria-label={buttonLabel}
                className={`recorder-btn ${isSessionActive ? 'recorder-btn--active' : ''}`}
            >
                <span className="recorder-btn__icon" aria-hidden="true">
                    {isSessionActive ? '⏹' : '🎙'}
                </span>
                <span className="recorder-btn__label">{buttonLabel}</span>
            </button>

            {/* FSM state indicator (hidden from main content but visible to SR) */}
            <span className="sr-only" aria-live="off" aria-atomic="true">
                Transcription state: {fsmState}
            </span>

            {/*
                T019: ARIA Polite live region for transcript text.
                aria-live="polite"  → Announce updates after the user finishes speaking (non-disruptive).
                aria-atomic="false" → Screen reader only announces the changed portion, not the full text.
                aria-relevant="additions text" → Announce additions and text changes.
            */}
            <div
                id="transcript-live-region"
                role="log"
                aria-live="polite"
                aria-atomic="false"
                aria-relevant="additions text"
                aria-label="Live speech transcript"
                className="transcript-container"
            >
                {tokenDiff.length > 0 ? (
                    <p className="transcript-text">
                        {tokenDiff.map((result, i) => (
                            <TokenSpan key={i} result={result} index={i} />
                        ))}
                    </p>
                ) : (committedText || speculativeText) ? (
                    /* Fallback: plain text render if diff is empty but text exists */
                    <p className="transcript-text">
                        {committedText && (
                            <span style={{ opacity: 1 }}>{committedText}</span>
                        )}
                        {speculativeText && speculativeText !== committedText && (
                            <span style={{ opacity: 0.45, color: 'var(--color-speculative, #6b7280)', marginLeft: '0.25em' }}>
                                {speculativeText.startsWith(committedText)
                                    ? speculativeText.slice(committedText.length).trim()
                                    : speculativeText}
                            </span>
                        )}
                    </p>
                ) : (
                    <p className="transcript-placeholder" aria-hidden="true">
                        {isSessionActive ? 'Listening…' : 'Start a session to begin speaking'}
                    </p>
                )}
            </div>

            {/* CSS keyframe for token fade-in animation — injected inline for portability */}
            <style>{`
                @keyframes token-fade-in {
                    from { opacity: 0; transform: translateY(2px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .transcript-container {
                    min-height: 3em;
                    padding: 0.75rem 1rem;
                    border-radius: 0.5rem;
                    background: var(--color-surface, rgba(255,255,255,0.05));
                    line-height: 1.6;
                }
                .transcript-text {
                    margin: 0;
                    font-size: 1rem;
                    word-break: break-word;
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
                    padding: 0.5rem 1rem;
                    border-radius: 9999px;
                    border: 2px solid currentColor;
                    cursor: pointer;
                    transition: opacity 120ms ease, transform 80ms ease;
                }
                .recorder-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                .recorder-btn--active {
                    background: var(--color-error, #ef4444);
                    color: white;
                    border-color: var(--color-error, #ef4444);
                }
                .model-loading-bar {
                    position: relative;
                    height: 4px;
                    background: var(--color-border, #e5e7eb);
                    border-radius: 2px;
                    margin-bottom: 0.75rem;
                    overflow: hidden;
                }
                .model-loading-fill {
                    height: 100%;
                    background: var(--color-accent, #6366f1);
                    transition: width 200ms ease;
                }
                .model-loading-label {
                    position: absolute;
                    top: 6px;
                    left: 0;
                    font-size: 0.7rem;
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
