# Design palette rules

## Source of truth

`src/lib/desktopPalette.ts` is the only source of production widget palette values. `App.tsx` selects a palette from that module and passes it directly to the card or orb. The design workbench (`/?designer`) reads the same module and must never store, export, or persist a second palette.

## Theme and state selection

- The desktop preference is `appearance`: `system`, `light`, or `dark`.
- `system` resolves from `prefers-color-scheme` in the frontend.
- Each resolved theme has independent records for `healthy`, `caution`, `critical`, `unavailable`, `stale`, and `signed_out`.
- A status palette takes priority over a percentage-derived palette.

Do not copy light values into dark records (or the reverse) as a convenience. Both themes are intentionally independent so an edit in one cannot change the other.

## Workbench contract

The design workbench may change preview-only geometry: corner radius, type size, progress height, brightness, and motion. These controls are held only in React state and reset on reload. Palette values are presented as a read-only matrix; changing a production palette requires an intentional edit to `desktopPalette.ts` and its tests.

## Change checklist

1. Update the relevant record in `src/lib/desktopPalette.ts`.
2. Add or update an assertion in `src/lib/desktopPalette.test.ts` for approved values.
3. Run `npm run build` and `npm test`.
4. Inspect both themes and all states through `/?designer` before shipping.
