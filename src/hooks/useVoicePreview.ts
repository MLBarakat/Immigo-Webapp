import { useCallback, useEffect, useRef } from 'react';
import { pickVoicePreviewSentence } from '../constants/voicePreview';
import { getVoiceLocale } from '../constants/voices';
import { logger } from '../logger';
import type { ApiClient } from '../services/apiClient';
import { acquirePollyPlaybackElement, unlockAudioPlayback } from '../utils/audioUtils';

/**
 * Speaks a short, localized introduction whenever the user changes the Polly
 * voice. The shared playback element keeps mobile autoplay authorization, and
 * each preview is scheduled only after a user gesture.
 */
export function useVoicePreview(
  apiClient: ApiClient | null,
): (voiceId: string, language: string, voiceName: string) => Promise<void> {
  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const lastSentenceByLanguageRef = useRef<Record<string, string>>({});

  useEffect(() => () => {
    controllerRef.current?.abort();
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  return useCallback(async (voiceId: string, language: string, voiceName: string): Promise<void> => {
    if (!apiClient) return;

    const voiceLocale = getVoiceLocale(language);
    const sentence = pickVoicePreviewSentence(
      voiceLocale,
      voiceName,
      lastSentenceByLanguageRef.current[voiceLocale],
    );
    lastSentenceByLanguageRef.current[voiceLocale] = sentence;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    // Must run synchronously inside the select/change user gesture so iOS can
    // authorize the shared media element before the async synthesis resolves.
    unlockAudioPlayback();

    try {
      const audioData = await apiClient.synthesizeSpeechText(sentence, {
        voiceId,
        preferredLanguage: voiceLocale,
        signal: controller.signal,
        headers: { 'x-correlation-trace-id': `voice-preview-${requestId}` },
      });
      if (controller.signal.aborted || requestId !== requestIdRef.current || audioData.byteLength === 0) {
        return;
      }

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      const url = URL.createObjectURL(new Blob([audioData], { type: 'audio/mpeg' }));
      audioUrlRef.current = url;
      const player = acquirePollyPlaybackElement(url);
      player.onended = () => {
        URL.revokeObjectURL(url);
        if (audioUrlRef.current === url) audioUrlRef.current = null;
      };

      try {
        await player.play();
      } catch (error) {
        URL.revokeObjectURL(url);
        if (audioUrlRef.current === url) audioUrlRef.current = null;
        throw error;
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      logger.warn('Voice preview playback failed.', {
        voiceId,
        language: voiceLocale,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [apiClient]);
}
