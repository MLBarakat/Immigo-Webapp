---
name: styling-ui-ux-a11y
description: Use for ImmiGO layout, Tailwind, responsive behavior, animation, interaction design, RTL, or accessibility.
---

# Styling, UI/UX, And Accessibility

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/FEATURES.md` (F-09, F-10), and nearby components.

## Project rules

- Inspect existing design tokens, Tailwind classes, component patterns, and breakpoints first.
- Use semantic HTML and real interactive elements. Provide labels, keyboard access, visible focus, sensible focus order, and useful alt text.
- Preserve readable text, contrast, zoom/reflow, reduced-motion behavior, and touch-sized controls.
- Arabic is RTL. Check direction-sensitive layout, icons, and overlays.
- Prefer the existing styling system and small changes. Avoid fixed dimensions that cause overflow.
- Do not add decorative complexity without a user benefit.
- Modals must trap focus, restore focus on close, and close on Escape where appropriate.
- New user-facing strings belong in locale files.

## Workflow

1. Read the component and its test.
2. Check narrow and wide widths, keyboard flow, and RTL.
3. Add or update a component/E2E test for the interaction.
4. Make the smallest styling change.
5. Run the focused test and `npm run verify`.

## Done when

- [ ] Semantic controls and labels are present.
- [ ] Keyboard and focus behavior work.
- [ ] Contrast, zoom, reduced motion, and touch targets are preserved.
- [ ] Arabic RTL layout works.
- [ ] The view works at narrow and wide widths.
- [ ] `npm run verify` passes.
