import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Headphones, Mic, Play, RefreshCw, Square, Volume2 } from 'lucide-react';
import {
  createMicrophoneStream,
  playTestChime,
  supportsAudioOutputSelection,
} from '../utils/audioUtils';
import { logger } from '../logger';

type MicTestState = 'idle' | 'measuring' | 'success' | 'silent' | 'error';
type SpeakerTestState = 'idle' | 'playing' | 'success' | 'error';
type PermissionState = 'unknown' | 'requesting' | 'granted' | 'denied';

interface AudioDeviceSettingsProps {
  inputDeviceId?: string | null;
  outputDeviceId?: string | null;
  onInputDeviceChange: (deviceId: string | null) => void;
  onOutputDeviceChange: (deviceId: string | null) => void;
  isSessionActive?: boolean;
}

const MIC_TEST_DURATION_MS = 6000;
const MIC_SIGNAL_THRESHOLD = 0.02;

function isMicrophonePermissionError(error: unknown): boolean {
  return typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError');
}

function formatDeviceLabel(
  device: MediaDeviceInfo,
  index: number,
  fallback: string,
): string {
  return device.label || fallback.replace('{{number}}', String(index + 1));
}

export function AudioDeviceSettings({
  inputDeviceId,
  outputDeviceId,
  onInputDeviceChange,
  onOutputDeviceChange,
  isSessionActive = false,
}: AudioDeviceSettingsProps): JSX.Element {
  const { t } = useTranslation('settings');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [micTest, setMicTest] = useState<MicTestState>('idle');
  const [micLevel, setMicLevel] = useState(0);
  const [speakerTest, setSpeakerTest] = useState<SpeakerTestState>('idle');
  const inputStreamRef = useRef<MediaStream | null>(null);
  const analyserContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const peakLevelRef = useRef(0);
  const testStartedAtRef = useRef(0);

  const supported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.enumerateDevices);
  const outputSelectionSupported = supportsAudioOutputSelection();

  const refreshDevices = useCallback(async (): Promise<void> => {
    if (!supported) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = list.filter(device => device.kind === 'audioinput' || device.kind === 'audiooutput');
      setDevices(audioDevices);
      if (audioDevices.some(device => device.label)) {
        setPermission(previous => previous === 'denied' ? previous : 'granted');
      }
    } catch (error) {
      logger.warn('Could not enumerate audio devices.', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [supported]);

  useEffect(() => {
    // Device enumeration is an external-system read; state is updated when it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    if (!supported) return;
    const handleDeviceChange = () => { void refreshDevices(); };
    navigator.mediaDevices.addEventListener?.('devicechange', handleDeviceChange);
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', handleDeviceChange);
  }, [refreshDevices, supported]);

  const releaseMicResources = useCallback((): void => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    inputStreamRef.current?.getTracks().forEach(track => track.stop());
    inputStreamRef.current = null;
    if (analyserContextRef.current) {
      void analyserContextRef.current.close().catch(() => undefined);
      analyserContextRef.current = null;
    }
    setMicLevel(0);
  }, []);

  useEffect(() => () => releaseMicResources(), [releaseMicResources]);

  const stopMicTest = useCallback((): void => {
    releaseMicResources();
    setMicTest('idle');
  }, [releaseMicResources]);

  useEffect(() => {
    // Starting a voice session takes ownership of the microphone; release it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isSessionActive && micTest === 'measuring') stopMicTest();
  }, [isSessionActive, micTest, stopMicTest]);

  const finishMicTest = useCallback((heardSound: boolean): void => {
    releaseMicResources();
    setMicTest(heardSound ? 'success' : 'silent');
  }, [releaseMicResources]);

  const requestMicrophonePermission = useCallback(async (): Promise<void> => {
    if (!supported) return;
    setPermission('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setPermission('granted');
      await refreshDevices();
    } catch (error) {
      logger.warn('Microphone permission request failed.', {
        error: error instanceof Error ? error.message : String(error),
      });
      setPermission(isMicrophonePermissionError(error) ? 'denied' : 'unknown');
    }
  }, [refreshDevices, supported]);

  const startMicTest = useCallback(async (): Promise<void> => {
    if (!supported || isSessionActive) return;
    releaseMicResources();
    setMicTest('measuring');
    setMicLevel(0);
    peakLevelRef.current = 0;
    testStartedAtRef.current = performance.now();

    try {
      const stream = await createMicrophoneStream({
        deviceId: inputDeviceId ?? null,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      });
      inputStreamRef.current = stream;
      setPermission('granted');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) throw new Error('Web Audio API is unavailable.');

      const context = new AudioContextClass({ latencyHint: 'interactive' }) as AudioContext;
      analyserContextRef.current = context;
      if (context.state === 'suspended') await context.resume();

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);

      const tick = () => {
        if (!analyserContextRef.current) return;
        analyser.getByteTimeDomainData(samples);

        let sumSquares = 0;
        for (let index = 0; index < samples.length; index += 1) {
          const normalized = (samples[index] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / samples.length);
        peakLevelRef.current = Math.max(peakLevelRef.current, rms);
        setMicLevel(Math.min(1, rms * 6));

        if (performance.now() - testStartedAtRef.current >= MIC_TEST_DURATION_MS) {
          finishMicTest(peakLevelRef.current >= MIC_SIGNAL_THRESHOLD);
          return;
        }
        animationFrameRef.current = requestAnimationFrame(tick);
      };

      animationFrameRef.current = requestAnimationFrame(tick);
      await refreshDevices();
    } catch (error) {
      logger.warn('Microphone test could not start.', {
        error: error instanceof Error ? error.message : String(error),
      });
      releaseMicResources();
      setMicTest('error');
      if (isMicrophonePermissionError(error)) setPermission('denied');
    }
  }, [finishMicTest, inputDeviceId, isSessionActive, refreshDevices, releaseMicResources, supported]);

  const handleSpeakerTest = useCallback(async (): Promise<void> => {
    setSpeakerTest('playing');
    const played = await playTestChime(outputDeviceId || null);
    setSpeakerTest(played ? 'success' : 'error');
  }, [outputDeviceId]);

  const inputDevices = devices.filter(device => device.kind === 'audioinput' && device.deviceId !== '');
  const outputDevices = devices.filter(device => device.kind === 'audiooutput' && device.deviceId !== '');
  const selectedInput = inputDevices.find(device => device.deviceId === inputDeviceId) ?? null;
  const selectedOutput = outputDevices.find(device => device.deviceId === outputDeviceId) ?? null;
  const labelsMissing = devices.length === 0 || devices.some(device => !device.label);
  const inputValue = selectedInput ? selectedInput.deviceId : '';
  const outputValue = selectedOutput ? selectedOutput.deviceId : '';

  if (!supported) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
        {t('audio.unsupported')}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-immigo-gray-200 bg-immigo-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-art-blue-100 text-art-blue-700 dark:bg-art-blue-900/40 dark:text-art-blue-200">
          <Headphones className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-immigo-gray-600 dark:text-gray-400">
            {t('audio.connectedDevice')}
          </p>
          <p className="truncate font-semibold text-deep-navy dark:text-gray-100">
            {selectedInput
              ? formatDeviceLabel(selectedInput, inputDevices.indexOf(selectedInput), t('audio.deviceFallback'))
              : t('audio.systemDefault')}
          </p>
          <p className="text-xs text-immigo-gray-600 dark:text-gray-400">
            {t('audio.deviceHint')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void refreshDevices(); }}
          aria-label={t('audio.refresh')}
          title={t('audio.refresh')}
          className="ml-auto flex-shrink-0 rounded-full p-2 text-immigo-gray-600 hover:bg-immigo-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {permission === 'denied' && (
        <p className="rounded-lg bg-art-red-50 p-2 text-sm text-art-red-700 dark:bg-art-red-900/20 dark:text-art-red-200" role="alert">
          {t('audio.permissionDenied')}
        </p>
      )}

      {(permission !== 'denied' && (permission === 'unknown' || labelsMissing)) && (
        <div className="rounded-lg border border-immigo-gray-200 bg-star-white p-3 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm font-semibold text-deep-navy dark:text-gray-100">{t('audio.permissionTitle')}</p>
          <p className="mt-1 text-xs text-immigo-gray-600 dark:text-gray-400">{t('audio.permissionDescription')}</p>
          <button
            type="button"
            onClick={() => { void requestMicrophonePermission(); }}
            disabled={permission === 'requesting'}
            className="mt-3 rounded-lg bg-art-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-art-blue-700 disabled:opacity-60"
          >
            {permission === 'requesting' ? t('audio.requesting') : t('audio.permissionButton')}
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 flex items-center gap-1.5 font-semibold text-deep-navy dark:text-gray-100">
            <Mic className="h-4 w-4" /> {t('audio.inputLabel')}
          </span>
          <select
            value={inputValue}
            onChange={(event) => onInputDeviceChange(event.target.value || null)}
            className="w-full rounded-lg border-2 border-immigo-gray-300 bg-star-white p-2 text-sm text-deep-navy dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">{t('audio.systemDefault')}</option>
            {inputDevices.map((device, index) => (
              <option key={device.deviceId || `input-${index}`} value={device.deviceId}>
                {formatDeviceLabel(device, index, t('audio.deviceFallback'))}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-immigo-gray-600 dark:text-gray-400">
            {t('audio.inputConnected', {
              device: selectedInput
                ? formatDeviceLabel(selectedInput, inputDevices.indexOf(selectedInput), t('audio.deviceFallback'))
                : t('audio.systemDefault'),
            })}
          </span>
        </label>

        <label className="block text-sm">
          <span className="mb-1 flex items-center gap-1.5 font-semibold text-deep-navy dark:text-gray-100">
            <Volume2 className="h-4 w-4" /> {t('audio.outputLabel')}
          </span>
          <select
            value={outputValue}
            onChange={(event) => onOutputDeviceChange(event.target.value || null)}
            disabled={!outputSelectionSupported}
            className="w-full rounded-lg border-2 border-immigo-gray-300 bg-star-white p-2 text-sm text-deep-navy disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">{t('audio.systemDefault')}</option>
            {outputDevices.map((device, index) => (
              <option key={device.deviceId || `output-${index}`} value={device.deviceId}>
                {formatDeviceLabel(device, index, t('audio.deviceFallback'))}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-immigo-gray-600 dark:text-gray-400">
            {t('audio.outputConnected', {
              device: selectedOutput
                ? formatDeviceLabel(selectedOutput, outputDevices.indexOf(selectedOutput), t('audio.deviceFallback'))
                : t('audio.systemDefault'),
            })}
          </span>
        </label>
      </div>

      {!outputSelectionSupported && (
        <p className="rounded-lg bg-immigo-gray-100 p-2 text-xs text-immigo-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {t('audio.speakerUnsupported')}
        </p>
      )}

      <div className="rounded-lg border border-immigo-gray-200 bg-star-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (micTest === 'measuring') stopMicTest();
              else void startMicTest();
            }}
            disabled={isSessionActive && micTest !== 'measuring'}
            className="inline-flex items-center gap-2 rounded-lg bg-art-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-art-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {micTest === 'measuring' ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {micTest === 'measuring' ? t('audio.stopTest') : t('audio.testMic')}
          </button>
          {micTest === 'measuring' && (
            <span className="text-xs font-semibold text-art-blue-700 dark:text-art-blue-300">{t('audio.testingMic')}</span>
          )}
        </div>

        {micTest === 'measuring' && (
          <div className="mt-3" aria-live="polite">
            <div className="h-2 w-full overflow-hidden rounded-full bg-immigo-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-[width] duration-75"
                style={{ width: `${Math.round(micLevel * 100)}%` }}
              />
            </div>
          </div>
        )}

        {micTest === 'success' && (
          <p className="mt-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300" role="status">{t('audio.micWorking')}</p>
        )}
        {micTest === 'silent' && (
          <p className="mt-3 text-sm font-semibold text-amber-700 dark:text-amber-300" role="status">{t('audio.micSilent')}</p>
        )}
        {micTest === 'error' && (
          <p className="mt-3 text-sm font-semibold text-art-red-700 dark:text-art-red-300" role="alert">{t('audio.micError')}</p>
        )}
        {isSessionActive && (
          <p className="mt-2 text-xs text-immigo-gray-600 dark:text-gray-400">{t('audio.micBusy')}</p>
        )}
      </div>

      <div className="rounded-lg border border-immigo-gray-200 bg-star-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <button
          type="button"
          onClick={() => { void handleSpeakerTest(); }}
          disabled={speakerTest === 'playing'}
          className="inline-flex items-center gap-2 rounded-lg border-2 border-art-blue-600 px-3 py-1.5 text-sm font-semibold text-art-blue-700 hover:bg-art-blue-50 disabled:opacity-60 dark:text-art-blue-200 dark:hover:bg-art-blue-900/30"
        >
          <Play className="h-4 w-4" />
          {speakerTest === 'playing' ? t('audio.testingSpeaker') : t('audio.testSpeaker')}
        </button>
        {speakerTest === 'success' && (
          <p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300" role="status">{t('audio.speakerPlayed')}</p>
        )}
        {speakerTest === 'error' && (
          <p className="mt-2 text-sm font-semibold text-art-red-700 dark:text-art-red-300" role="alert">{t('audio.speakerFailed')}</p>
        )}
      </div>
    </div>
  );
}
