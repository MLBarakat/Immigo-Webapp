export const privacyContent = {
  effectiveDate: 'August 26, 2026',
  sections: [
    {
      title: '1. Who we are',
      content: `ImmiGO ("ImmiGO," "we," "us") provides a voice-based study aid to help people practice for the U.S. naturalization (N-400) civics interview. ImmiGO is an independent study tool. It is not affiliated with, endorsed by, or connected to USCIS or any U.S. government agency.`,
    },
    {
      title: '2. What this app is (and isn\'t)',
      content: `ImmiGO is an educational practice tool. It does not provide legal advice, immigration advice, or any guarantee that you will pass your interview or naturalization application.`,
    },
    {
      title: '3. Information we collect',
      content: `Account information you provide at registration (e.g., email, first name, and optional preferences such as preferred language and target interview date). Your spoken answers as text: your device transcribes your speech to text on your device, and only the resulting text transcript is sent to us — we do not receive, store, or process audio recordings, and we do not create or store voiceprints or any biometric identifiers. Practice results: which civics questions you practiced and whether each answer was graded correct, partial, or incorrect, with timestamps. Progress summaries generated to help you study. Technical logs used to run and secure the service. We practice data minimization: we collect only what is needed to run the study tool and track your progress.`,
    },
    {
      title: '4. How we use your information',
      content: `To provide the tutoring/grading service, track and personalize your progress, operate and secure the app, and comply with law. We do not sell your personal information, and we do not use it for advertising.`,
    },
    {
      title: '5. How long we keep it (retention)',
      content: `Conversation transcripts are automatically deleted 7 days after creation. Practice results and progress summaries are kept while your account is active, to power your progress tracking. Account information is kept while your account is active. When you delete your account, all of the above associated with you is deleted (see Section 8).`,
    },
    {
      title: '6. Service providers (sub-processors)',
      content: `We use these providers strictly to operate the app, and they process data on our behalf under their terms. Amazon Web Services (AWS) — Bedrock (AI grading) and Polly (text-to-speech); we do not authorize use of your inputs to train third-party models, and AWS Bedrock's terms state customer content is not used to train models. Supabase — database and authentication (data hosting). We do not permit these providers to use your information for their own purposes.`,
    },
    {
      title: '7. AI processing and its limits',
      content: `Grading and explanations are produced with AI constrained to the official civics question set. AI can still make mistakes; results are for practice only and are not a prediction of your official interview outcome. Time- or location-dependent answers (e.g., current officeholders) change and should be verified against official U.S. government sources.`,
    },
    {
      title: '8. Your privacy rights (U.S. / California CCPA-CPRA)',
      content: `Depending on your state, you may have the right to know what we collect, access it, correct it, delete it, and not be discriminated against for exercising these rights. Because we do not sell or "share" personal information for cross-context behavioral advertising, there is nothing to opt out of in that respect. To exercise rights, contact us at [PRIVACY EMAIL]. You can delete your account and associated data at any time in the app (Account Settings), which triggers deletion across our systems.`,
    },
    {
      title: '9. Children',
      content: `ImmiGO is intended for adults (18+). We do not knowingly collect information from children.`,
    },
    {
      title: '10. Security',
      content: `We use access controls (per-user row-level security), encrypted transport, and least-privilege practices. No system is perfectly secure; we cannot guarantee absolute security.`,
    },
    {
      title: '11. Changes',
      content: `We may update this policy; we will post the new date above and, for material changes, notify you in-app.`,
    },
    {
      title: '12. Contact',
      content: `[COMPANY LEGAL NAME], [ADDRESS], [PRIVACY EMAIL]`,
    },
  ],
};

/** Version stamp recorded when a user accepts, so acceptance is auditable. */
export const PRIVACY_VERSION = '2026-08-26';
