export const MIC_CONSENT_VERSION = '2026-08-26';

export function hasMicConsent(consentVersion?: string | null): boolean {
  return consentVersion === MIC_CONSENT_VERSION;
}
