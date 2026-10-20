// Cross-document kill forensics v2 (sessionStorage-backed).
//
// WHY THIS EXISTS: iOS terminates the WebContent process (jetsam/native fault)
// without firing pagehide, and DedicatedWorker console output does not reach
// field log captures (proven 2026-10-20: the worker's [WHISPER-ORT] line must
// have executed before INIT_COMPLETED, yet only the main-thread line appeared).
// sessionStorage, however, is persisted by the browser UI process and DOES
// survive the kill. Any fact that must outlive the dying document therefore
// gets written here, and the next boot reads it back and reports it in the
// `previous-document-fate` line of the console.
//
// SEMANTICS: one record per document. main.tsx writes the fresh record at boot
// (full replace — clears all per-document marks), then every later writer only
// MERGES fields via markDocTombstone. All operations are fail-silent: this is
// diagnostics-only and must never throw into feature code, never create
// records before boot, and never influence control flow.
//
// NO PII / NO MIC DATA: timestamps, boolean flags, and heap numbers only.

export interface DocTombstone {
  /** Fresh per-boot identity — a new bootId with pagehideFired:false proves the previous document died without unloading. */
  bootId: string;
  /** Document boot time (ISO). */
  time: string;
  /** Set by the pagehide handler; false at boot ⇒ process kill / crash. */
  pagehideFired: boolean;
  /** Set by the pagehide handler (ISO); null/absent when the document never unloaded. */
  pagehideAt?: string | null;
  /** Last visibilitychange state seen ('visible' | 'hidden'). */
  lastVisibilityState?: string | null;
  /** When that visibilitychange fired (ISO). */
  lastVisibilityAt?: string | null;
  /** Last 2s heartbeat (ISO) — narrows the kill window to ≤ heartbeat interval. */
  lastBeatAt?: string | null;
  /** document.hidden at the last heartbeat — freshest pre-death visibility. */
  lastBeatHidden?: boolean | null;
  /** performance.memory.usedJSHeapSize at the last heartbeat when supported (Chrome Android/desktop); null on WebKit/iOS. */
  lastBeatJsHeap?: number | null;
  /** postTranscript dispatch attempt (ISO); cleared on each retry dispatch. */
  submitAt?: string | null;
  /** Set when that attempt's response arrived (ISO). */
  submitResponseAt?: string | null;
  /** Set when that attempt threw a non-kill error (ISO). */
  submitErrorAt?: string | null;
  /** Last TRANSCRIBE dispatched to the whisper worker (ISO). */
  inferAt?: string | null;
  /** Set when the matching worker COMPLETED arrived (ISO). */
  inferCompletedAt?: string | null;
  /** Set when the worker reported ERROR for that inference (ISO). */
  inferErrorAt?: string | null;
}

const DIAG_TOMBSTONE_KEY = 'immigo_doc_tombstone_v1';

/** Full replace — call once per document at boot, AFTER reading the previous record. */
export function writeDocTombstone(record: DocTombstone): void {
  try { sessionStorage.setItem(DIAG_TOMBSTONE_KEY, JSON.stringify(record)); } catch { /* storage unavailable */ }
}

/** Read the surviving record of the previous document; null on absence or corruption. */
export function readDocTombstone(): DocTombstone | null {
  try {
    const raw = sessionStorage.getItem(DIAG_TOMBSTONE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DocTombstone> | null;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.bootId !== 'string') return null;
    return { bootId: parsed.bootId, time: String(parsed.time ?? ''), pagehideFired: Boolean(parsed.pagehideFired), ...parsed } as DocTombstone;
  } catch { return null; }
}

/**
 * Merge-patch the CURRENT document's record. Deliberately refuses to create a
 * record when none exists (writers can race boot in tests; orphan marks would
 * pollute the next boot's previous-document-fate report).
 */
export function markDocTombstone(patch: Partial<DocTombstone>): void {
  try {
    const raw = sessionStorage.getItem(DIAG_TOMBSTONE_KEY);
    if (!raw) return;
    const current = JSON.parse(raw) as Record<string, unknown> | null;
    if (!current || typeof current !== 'object') return;
    sessionStorage.setItem(DIAG_TOMBSTONE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch { /* diagnostics must never throw */ }
}
