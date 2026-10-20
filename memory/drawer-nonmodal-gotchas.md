---
name: drawer-nonmodal-gotchas
description: How non-modal Vaul drawers work here (Radix stays modal underneath) and the pitfalls the calendar/agenda UI must design around
type: project
---

Drawers became non-modal on 2026-10-20 (Gate 1 feedback). Vaul 1.1.2's `modal={false}` does not reach the Radix Dialog it wraps, so `components/ui/drawer.tsx` undoes Radix's modal side effects by hand (body pointer-events, `aria-hidden` on the page) and implements outside-tap close itself. Guarded drawers (`dismissible={false}` + `onDismissAttempt`) swallow the outside click in the capture phase.

Pitfalls for later tasks:
- On touch, a normal drawer's outside-close fires AFTER the tapped element's own click. If gig B's tap sets a shared "selected event" state, gig A's `onOpenChange(false)` can clear it. Event drawers (3.1/3.2) must close by id (`if (selected === closingId) setSelected(null)`) or key the drawer per event.
- Radix's focus trap is still active: tapping a text input behind an open drawer may not focus until the drawer closes.
- After a modal dialog closes inside a drawer, the page can keep `aria-hidden` until the drawer closes (screen readers, role-based test queries).
- `NestedDrawer` is a plain Root, not Vaul's NestedRoot (NestedRoot made the parent jump).
- Keyboard fit (`lib/use-visual-viewport.ts`) is only simulated in tests; real iOS behavior needs a device check.

**How to apply:** put these bullets in briefs for any agent building event, library, or roster drawers, and re-check them if Vaul is upgraded or replaced. Related: [[scaffold-gotchas]].
