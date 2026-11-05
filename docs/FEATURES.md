# ImmiGO Feature Registry

**Version:** 1.0.0  
**Updated:** 2026-10-31  
**Machine-readable source:** `docs/features.json`  
**Policy:** `docs/CONSTITUTION.md`

This registry is the contract between the product, the tests, and every AI coding tool. A feature is not "done" because code exists. It is done when its behavior is listed here and protected by at least one executable test.

## How to use this registry

1. Find the feature ID that owns the behavior you are changing.
2. Read its invariants and its test map.
3. Run the mapped tests before editing.
4. Add or update a failing test before changing behavior.
5. Update this file and `docs/features.json` in the same change.

## Status meanings

| Status | Meaning | Change rule |
|---|---|---|
| `protected` | User-visible or security-relevant behavior that must not regress | Spec delta, failing test, explicit approval, test update |
| `active` | Supported behavior with a lower regression risk | Test update required; approval for contract changes |
| `experimental` | Intentionally incomplete or behind a flag | May change, but must stay tested |
| `deprecated` | Scheduled for removal | Do not add new dependencies on it |

## Feature index

| ID | Feature | Status | Primary owner |
|---|---|---|---|
| F-01 | Authentication and session ownership | protected | `src/context/AuthContext.tsx` |
| F-02 | Transcription FSM and reconciliation | protected | `src/context/TranscriptionContext.tsx` |
| F-03 | Audio capture and playback lifecycle | protected | `src/hooks/useVAD.ts` |
| F-04 | Conversation modes and Standard Interviews | protected | `src/hooks/useConversation.ts` |
| F-05 | Civics grading and turn policy | protected | `amplify/functions/transcript/turn/` |
| F-06 | Progress reports and daily learning | protected | `amplify/functions/aggregateSession/handler.ts` |
| F-07 | History persistence and pagination | protected | `src/services/chatPersistenceService.ts` |
| F-08 | Settings and preferences | protected | `src/services/userSettingsService.ts` |
| F-09 | Internationalization and RTL | protected | `src/i18n/` |
| F-10 | Accessibility and responsive layout | protected | `src/components/` |
| F-11 | Account settings and deletion | protected | `src/components/AccountSettingsPage.tsx` |
| F-12 | Notifications and feedback | active | `src/hooks/useNotifications.ts` |
| F-13 | API contracts and backend functions | protected | `src/services/apiClient.ts` |
| F-14 | Database schema and RLS | protected | `supabase/migrations/` |
| F-15 | Security and privacy boundaries | protected | `src/supabaseClient.ts` |
| F-16 | Observability and error handling | active | `src/logger.ts` |

---

## F-01 — Authentication and session ownership

**Status:** protected  
**Entry points:** `src/context/AuthContext.tsx`, `src/context/authContextTypes.ts`, `src/hooks/useAuth.ts`, `src/components/AuthPage.tsx`, `src/supabaseClient.ts`

**Invariants**

- Supabase Auth is the only user authentication provider.
- Protected backend routes validate the Supabase bearer token server-side.
- Authentication is not authorization; ownership is enforced by RLS and user-scoped queries.
- Single-active-device replacement is intentional and must not be bypassed.
- Auth state changes must not unmount a live transcription session without cleanup.

**Tests:** `src/context/__tests__/AuthContext.test.tsx`, `src/components/__tests__/AuthPage.test.tsx`, `tests/e2e/auth.spec.ts`, `tests/e2e/lifecycle.spec.ts`

---

## F-02 — Transcription FSM and reconciliation

**Status:** protected  
**Entry points:** `src/context/TranscriptionContext.tsx`, `src/context/transcriptionReducer.ts`, `src/utils/diffReconciliation.ts`, `src/hooks/useWhisper.ts`, `src/workers/whisper.worker.ts`

**Invariants**

- Browser speech is speculative; Whisper is the truth ledger.
- The FSM guards every transition. Invalid transitions return the previous state.
- `WHISPER_COMPLETE` merges browser text and Whisper text, then returns to `LISTENING`; it must not strand the session in `COMMITTED`.
- Recovery is `FAILED -> RECOVERING -> LISTENING`. A direct `FAILED -> LISTENING` transition is blocked.
- `SESSION_END` clears speculative text and the active trace ID.
- Token-level reconciliation must not drop or duplicate committed text.

**Tests:** `tests/unit/transcription_state.test.ts`, `src/context/__tests__/TranscriptionContext.test.tsx`, `tests/unit/diff_reconciliation.test.ts`, `src/utils/__tests__/diffReconciliation.test.ts`, `tests/e2e/transcription_flow.spec.ts`, `tests/e2e/voice-roundtrip.spec.ts`

---

## F-03 — Audio capture and playback lifecycle

**Status:** protected  
**Entry points:** `src/hooks/useConversation.ts`, `src/hooks/useVAD.ts`, `src/hooks/useWhisper.ts`, `src/utils/AudioRingBuffer.ts`, `src/utils/audioConditioning.ts`, `src/utils/audioUtils.ts`, `src/utils/bargeIn.ts`, `src/utils/micConsent.ts`

**Invariants**

- Microphone access is user-initiated and consent-gated.
- Workers, audio nodes, media streams, timers, and subscriptions are released on session end, unmount, and visibility changes.
- Barge-in must not leave two playback paths active.
- Spoken progress summaries are queued until the current assistant response and post-playback AEC settle window are complete; active user speech defers them.
- Device preferences are applied before the next session starts.
- Long-running audio work stays out of synchronous Lambda requests.

**Tests:** `tests/unit/audio_ring_buffer.test.ts`, `src/utils/__tests__/audioConditioning.test.ts`, `src/utils/__tests__/audioUtils.test.ts`, `src/utils/__tests__/bargeIn.test.ts`, `src/hooks/__tests__/useWhisper.test.tsx`, `src/hooks/__tests__/useConversation.test.tsx`, `tests/e2e/voice-errors.spec.ts`, `tests/e2e/voice-permission-denied.spec.ts`, `tests/e2e/lifecycle.spec.ts`

---

## F-04 — Conversation modes and Standard Interviews

**Status:** protected  
**Entry points:** `src/hooks/useConversation.ts`, `src/context/ConversationContext.tsx`, `src/services/mockExamService.ts`, `src/components/FeedbackModal.tsx`, `src/constants/focusCategories.ts`, `amplify/functions/transcript/handler.ts`, `amplify/functions/transcript/english-exercises.ts`

**Invariants**

- Standard Interview is the user-facing name for the existing scored interview flow; internal identifiers and scoring behavior remain unchanged.
- Standard Interview, Practice, and Study workflows preserve their turn semantics.
- Mode changes do not lose persisted history or corrupt the active exam run.
- Leaving an unfinished Standard Interview requires confirmation; its progress remains saved.
- Returning to an unfinished Standard Interview explicitly offers resume or start new.
- Starting a new Standard Interview marks every previously unfinished Standard Interview as completed; those closed interviews do not receive a new report or scorecard.
- The AI welcome appears once per account-local date even when prior conversation history is present; existing history is preserved.
- Capturing a resume or start-new decision never activates or deactivates voice mode: a text conversation stays text-only, and an active voice session keeps its microphone and playback.
- Starting or resuming a Standard Interview immediately displays the contextual opening and current question in the chat area; when greeting audio is unavailable or fails, the full text is shown instead.
- Detailed progress reports refresh silently after every ten scored civics answers in the active Standard Interview.
- Reading/writing stages and stable prompt selections are preserved.
- An interview review is server-generated; the client renders it without inventing scores.
- The final graded answer of a Standard Interview explicitly states that the interview is complete, and the next assistant bubble is a warm summary with the recommended mode, an invitation to open the Interview Report, and a prompt to capture the decision and goals.
- The completion summary never mentions questions to review.
- The completed-exam review presents the interview report, score breakdown, question outcomes, strengths, focus areas, and one explicit next-step decision; it has no separate question-review or detailed-report entry points.
- Dismissing the review is not a decision; a saved decision is immutable, and Practice/Study choices require one to three official USCIS focus categories or free-text Other that update the account goal atomically.
- A saved next-step decision is shown consistently in the report and remains distinct from the follow-on action, which can be retried without changing the saved decision.

**Tests:** `src/hooks/__tests__/useConversation.test.tsx`, `src/services/__tests__/mockExamService.test.ts`, `src/components/__tests__/ConversationHub.test.tsx`, `src/components/__tests__/CenterPanel.test.tsx`, `src/components/__tests__/FeedbackModal.test.tsx`, `src/constants/__tests__/focusCategories.test.ts`, `amplify/functions/transcript/__tests__/english-exercises.test.ts`, `amplify/functions/transcript/__tests__/mock-exam-routing.test.ts`, `tests/e2e/text-roundtrip.spec.ts`, `tests/e2e/edge-cases.spec.ts`

---

## F-05 — Civics grading and turn policy

**Status:** protected  
**Entry points:** `amplify/functions/transcript/turn/turn-policy.ts`, `amplify/functions/transcript/turn/turn-interpreter.ts`, `amplify/functions/transcript/turn/matching.ts`, `amplify/functions/transcript/turn/bank.ts`, `amplify/functions/transcript/handler.ts`

**Invariants**

- Civics answers are graded server-side. The client never decides correctness.
- Partial answers, confirmations, hints, repeats, progress questions, and ungraded current-answer questions remain distinct.
- `graded_answers` is the authoritative record for progress reports.
- A grading change requires an eval run and a reviewed prompt change.
- Question-bank IDs and test-version routing remain stable.

**Tests:** `amplify/functions/transcript/turn/__tests__/turn-policy.test.ts`, `turn-policy.flow.test.ts`, `turn-policy.confirmation.test.ts`, `turn-interpreter.test.ts`, `turn-interpreter.transcript-fixes.test.ts`, `turn-interpreter.prompts.test.ts`, `matching.test.ts`, `bank.test.ts`, `welcomeBanner.test.ts`, `amplify/functions/transcript/__tests__/ssml.test.ts`, `eval/civics/__tests__/civics-eval.test.ts`

---

## F-06 — Progress reports and daily learning

**Status:** protected  
**Entry points:** `amplify/functions/aggregateSession/handler.ts`, `amplify/functions/aggregateSession/reportFormat.ts`, `src/services/liveProgressService.ts`, `src/hooks/useConversation.ts`, `src/components/LeftPanel.tsx`, `src/App.tsx`

**Invariants**

- Reports are generated from persisted messages and authoritative graded answers.
- The Lambda never overrides recorded verdicts with model judgment.
- All report numbers are rendered from recorded grading facts; Bedrock supplies qualitative commentary only.
- Category ratings are not inferred from transcript prose or copied forward as scores.
- A report's displayed date and grading facts refer to the account-local session date.
- English Clarity is planned as transcript-only grammar, word-choice, and coherence feedback; its numeric score stays hidden until calibrated.
- Response Completeness is planned against explicit question-specific criteria, independently of correctness, and remains unscored until validated.
- A session with no messages and no graded answers returns an empty report without calling Bedrock.
- The report includes the educational disclaimer and is upserted by `(user_id, date)`.
- Bedrock or database failures return a typed error, not a fabricated report.
- Learners can request a progress report at any time; the answer states current progress and the distance remaining, uses warm encouraging phrasing, and offers to continue.
- A requested progress report is grounded in mode-specific recorded facts: Standard reports questions answered and remaining, Practice reports today's activity, accuracy, the next ten-answer milestone, and the weekly target, and Study reports the position in the sequential bank, questions ahead, and the current category.
- Weekly progress counts persisted graded answers from Monday through the current account-local date in the account time zone, across all three modes and all verdicts.
- A weekly target is optional and disabled when unset; the learning-goal card distinguishes an unset target from zero progress.
- Applying a saved focus in Practice or Study requires confirmation and sends it through the existing conversation message flow.
- Detailed reports refresh silently every ten account-local daily graded answers in Practice and Study.
- Practice and Study show a one-line factual summary after each assistant response, based only on recorded daily grading counts; summaries are not persisted as conversation context.
- When voice is active, Polly speaks that summary only after the current response and AEC settle window; active user speech defers it.

**Tests:** `src/services/__tests__/liveProgressService.test.ts`, `src/hooks/__tests__/useConversation.test.tsx`, `src/components/__tests__/PanelHeaders.test.tsx`, `amplify/functions/aggregateSession/__tests__/handler.test.ts`, `eval/reports/__tests__/reports-eval.test.ts`, `tests/e2e/network-chaos.spec.ts`

---

## F-07 — History persistence and pagination

**Status:** protected  
**Entry points:** `src/services/chatPersistenceService.ts`, `src/components/ConversationHistory.tsx`, `src/hooks/useConversation.ts`

**Invariants**

- Messages remain ordered and are never dropped or duplicated by pagination.
- History is user-scoped and RLS-protected.
- Loading older messages preserves scroll position and the active session.
- Transcript download reflects the persisted conversation.

**Tests:** `src/services/__tests__/chatPersistenceService.test.ts`, `src/components/__tests__/ConversationHistory.test.tsx`, `tests/e2e/infinite-scroll.spec.ts`, `tests/e2e/text-roundtrip.spec.ts`

---

## F-08 — Settings and preferences

**Status:** protected  
**Entry points:** `src/services/userSettingsService.ts`, `src/components/ApplicationSettingsModal.tsx`, `src/components/RightPanel.tsx`, `src/components/LeftPanel.tsx`, `src/components/FontSizeSelector.tsx`, `src/utils/fontSize.ts`, `src/utils/theme.ts`

**Invariants**

- Settings persist per user and survive reloads.
- Theme and font-size previews do not commit until saved.
- Language, voice, audio-device, notification, and accessibility preferences keep their existing keys.
- Up to three official USCIS focus categories plus a separate free-text Other persist as the account learning goal with an optional weekly graded-answer target.
- Learning Goals are edited only in the right panel under Question bank and auto-save without a Save button; Application Settings does not edit or persist them.
- The suggested weekly target is 20, but remains unset until the user chooses one.
- The target week is Monday through Sunday in the account time zone and counts answers from every mode.
- Invalid or missing settings fall back to documented defaults.

**Tests:** `src/components/__tests__/ApplicationSettingsModal.test.tsx`, `src/components/__tests__/RightPanel.test.tsx`, `src/services/__tests__/userSettingsService.test.ts`, `src/components/__tests__/PanelHeaders.test.tsx`, `src/components/__tests__/FontSizeSelector.test.tsx`, `src/utils/__tests__/fontSize.test.ts`, `tests/e2e/settings-persistence.spec.ts`

---

## F-09 — Internationalization and RTL

**Status:** protected  
**Entry points:** `src/i18n/index.ts`, `src/i18n/I18nProvider.tsx`, `src/components/LanguageSelector.tsx`, `src/i18n/locales/{en-US,es-ES,fr-FR,ar-SA}/{conversation,settings}.json`

**Invariants**

- English, Spanish, French, and Arabic remain supported.
- Arabic renders RTL; layout, icons, and overlays respect direction.
- New user-facing strings live in locale files, not components.
- Language changes persist and do not reset the active session.

**Tests:** `src/i18n/__tests__/i18n.test.tsx`, `src/components/__tests__/RtlOverlays.test.tsx`, `src/components/__tests__/PanelHeaders.test.tsx`

---

## F-10 — Accessibility and responsive layout

**Status:** protected  
**Entry points:** `src/hooks/useFocusTrap.ts`, `src/components/RightPanel.tsx`, `src/components/MobileMenuOverlay.tsx`, `src/components/CenterPanel.tsx`, `src/components/Header.tsx`, `src/components/Footer.tsx`

**Invariants**

- Interactive controls are semantic, labelled, keyboard reachable, and have visible focus.
- Modals trap focus, restore focus on close, and close on Escape where appropriate.
- Layout works at narrow and wide widths without horizontal overflow.
- Reduced-motion preferences are respected.
- Touch targets remain usable on mobile.

**Tests:** `src/components/__tests__/MobileMenuOverlay.test.tsx`, `src/components/__tests__/WelcomeModal.test.tsx`, `src/components/__tests__/PanelHeaders.test.tsx`, `tests/e2e/visual-regression.spec.ts`, `tests/e2e/performance.spec.ts`

---

## F-11 — Account settings and deletion

**Status:** protected  
**Entry points:** `src/components/AccountSettingsPage.tsx`, `amplify/functions/deleteAccount/handler.ts`

**Invariants**

- Profile and password updates are authenticated and user-scoped.
- Account deletion requires a valid bearer token and deletes only the caller.
- Deletion uses the service-role key server-side only.
- Deletion failures return a safe error and do not claim success.
- Cascade deletion removes user-owned data.

**Tests:** `src/components/__tests__/AccountSettingsPage.test.tsx`, `amplify/functions/deleteAccount/__tests__/handler.test.ts`, `tests/e2e/settings-persistence.spec.ts`

---

## F-12 — Notifications and feedback

**Status:** active  
**Entry points:** `src/hooks/useNotifications.ts`, `src/components/NotificationsPanel.tsx`, `src/components/FeedbackModal.tsx`, `src/services/feedbackService.ts`

**Invariants**

- Notifications are user-scoped and respect notification preferences.
- Read/unread and clear-all state remain consistent.
- Feedback submission does not expose transcripts or PII beyond the intended payload.
- Feedback failures are visible to the user, not swallowed.

**Tests:** `src/hooks/__tests__/useNotifications.test.tsx`, `src/components/__tests__/FeedbackModal.test.tsx`

---

## F-13 — API contracts and backend functions

**Status:** protected  
**Entry points:** `src/services/apiClient.ts`, `amplify/functions/transcript/handler.ts`, `amplify/functions/aggregateSession/handler.ts`, `amplify/functions/deleteAccount/handler.ts`, `amplify/backend.ts`

**Invariants**

- Routes remain `POST /transcript`, `POST /complete-session`, and `POST /delete-account`.
- Request/response shapes and status codes are contracts.
- Every protected route validates the bearer token before work.
- Invalid input returns `400`; missing/invalid auth returns `401`; downstream failure returns `500`.
- Backend handlers remain raw API Gateway handlers; no Express layer.
- `POST /transcript` accepts a validated speech-only progress-summary request and returns Polly audio without creating a user transcript or grading turn.
- The completed-exam review response includes server-generated scorecard and question-outcome data; the client validates and presents those facts without calculating scores.

**Tests:** `src/services/__tests__/apiClient.test.ts`, `amplify/functions/transcript/__tests__/mock-exam-routing.test.ts`, `amplify/functions/aggregateSession/__tests__/handler.test.ts`, `amplify/functions/deleteAccount/__tests__/handler.test.ts`, `tests/integration/websocket_api.test.ts`

---

## F-14 — Database schema and RLS

**Status:** protected  
**Entry points:** `supabase/migrations/`

**Invariants**

- Migrations are the only schema source of truth. The baseline records the existing hosted schema; later migrations advance it.
- Schema changes are expand/contract and include a rollback plan.
- Every user-owned table has RLS enabled and owner-scoped policies. No policy is unconditional or explicitly targets anon.
- Anon has no EXECUTE on public functions; `SECURITY DEFINER` functions pin `search_path`; trigger-only helpers revoke EXECUTE.
- Foreign keys to `auth.users` cascade on delete.
- Every public table except `sessions` keeps NOT NULL `created_at`/`updated_at` with an on-update trigger.
- Generated TypeScript types and `docs/DATABASE.md` stay in sync with migrations.
- `user_settings.learning_goal` is nullable and limited to 300 non-whitespace characters; `weekly_graded_answer_target` is nullable and positive when set.
- Completed interview decisions are constrained to supported choices, saved once through an authenticated owner-scoped transaction, and immutable thereafter; Practice/Study decisions atomically synchronize the account learning goal.
- The live round-trip test remains available behind `RUN_DB_ROUNDTRIP=1`.

**Tests:** `tests/integration/migrations.test.ts`, `tests/integration/gradedAnswers.roundtrip.test.ts`, `tests/integration/mockExamReviewDecision.test.ts`

---

## F-15 — Security and privacy boundaries

**Status:** protected  
**Entry points:** `src/supabaseClient.ts`, `src/logger.ts`, `amplify/functions/transcript/handler.ts`, `amplify/functions/aggregateSession/handler.ts`, `amplify/functions/deleteAccount/handler.ts`

**Invariants**

- Secrets never enter `VITE_*` variables, client code, logs, tests, or commits.
- Authorization is enforced server-side and by RLS.
- Public database objects are deny-by-default: no anon table access to user data and no anon EXECUTE on public functions.
- Maintenance RPCs such as `purge_old_messages` are not callable by clients.
- Logs exclude tokens, raw authorization headers, transcripts, and unnecessary PII.
- External input is validated at the boundary.
- Error responses do not leak stack traces or secrets.

**Tests:** `src/services/__tests__/apiClient.test.ts`, `src/__tests__/logger.test.ts`, `src/context/__tests__/AuthContext.test.tsx`, `amplify/functions/deleteAccount/__tests__/handler.test.ts`, `tests/integration/migrations.test.ts`

---

## F-16 — Observability and error handling

**Status:** active  
**Entry points:** `src/logger.ts`, `src/ErrorBoundary.tsx`, `src/services/apiClient.ts`, `src/components/AppLoadingOverlay.tsx`

**Invariants**

- Errors are logged with operation and correlation context, not raw payloads.
- The error boundary renders a recovery path instead of a blank screen.
- API failures surface a typed error and a user-visible message.
- Loading, empty, error, and retry states remain distinct.

**Tests:** `src/__tests__/logger.test.ts`, `src/__tests__/ErrorBoundary.test.tsx`, `src/services/__tests__/apiClient.test.ts`, `tests/e2e/voice-errors.spec.ts`

---

## Adding a feature

1. Add an entry to this file and `docs/features.json`.
2. Add at least one test that fails for the right reason.
3. Add the test paths to the entry.
4. Run `npm run verify:governance`.
5. Run `npm run verify`.

If a feature cannot be tested at the unit level, document the integration or E2E test that protects it. "Hard to test" is not an accepted status.
