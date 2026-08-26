// One-time microphone/processing disclosure acknowledgment (E2 consent).
// This is a UX disclosure — audio never leaves the device and is never stored —
// so a per-browser localStorage acknowledgment is proportionate.
const KEY = 'immigo_mic_consent_version';
export const MIC_CONSENT_VERSION = '2026-08-26';

export function hasMicConsent(): boolean {
  try {
    return localStorage.getItem(KEY) === MIC_CONSENT_VERSION;
  } catch {
    return false;
  }
}

export function setMicConsent(): void {
  try {
    localStorage.setItem(KEY, MIC_CONSENT_VERSION);
  } catch {
    /* storage unavailable; proceed without persisting */
  }
}
