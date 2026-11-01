---
name: react-vite-frontend
description: Use for ImmiGO React components, hooks, contexts, routing, Vite configuration, browser APIs, audio/worker lifecycle, or any src/ change.
---

# React And Vite Frontend

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/ARCHITECTURE.md`, the feature entry, and nearby components/hooks.

## Project rules

- React 18 + TypeScript + Vite + Tailwind. Keep components functional and props typed.
- Use the existing context/hook patterns. Do not add a state library or global store.
- State updates are immutable. Effect dependencies are complete; clean up subscriptions, timers, sockets, workers, audio nodes, and streams.
- Handle loading, empty, error, retry, and unavailable-data states for async UI.
- Keep secrets out of client code. Only intentionally public `VITE_*` values are allowed.
- Preserve i18n/RTL, accessibility, focus behavior, and responsive layout.
- Use the existing `logger` and `ErrorBoundary`. Do not log routine renders.
- Do not add memoization without evidence of a render problem.
- For audio/transcription changes, preserve the FSM guards and cleanup in `TranscriptionContext`, `useVAD`, `useWhisper`, and `AudioRingBuffer`.

## Workflow

1. Read the closest component/hook and its test.
2. Add a failing component or hook test for the behavior.
3. Make the smallest change.
4. Run the focused test, then `npm run verify`.
5. Check narrow/wide widths and Arabic RTL when layout changes.

## Done when

- [ ] Effects clean up after themselves.
- [ ] Loading/error/empty states are handled.
- [ ] No secret or backend key is in client code.
- [ ] i18n/RTL and accessibility are preserved.
- [ ] A focused test exists.
- [ ] `npm run verify` passes.
