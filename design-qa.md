# Supporter window visual QA

- Source visual truth: a local temporary reference image (not committed)
- Implementation target: `src/components/SupporterPanel.tsx`
- Intended viewport: 520 × 640 px desktop window
- State: Chinese, Blur option selected, no validation error

## Evidence

- TypeScript check passed with `node_modules\\.bin\\tsc.cmd --noEmit`.
- Vite production build passed with `node_modules\\.bin\\vite.cmd build --configLoader native`.
- Browser screenshot capture is blocked because the local preview server refused the connection after the build process stopped it.

## Required fidelity surfaces

- Fonts and typography: implemented from the reference using the system UI font stack, with a white logo lockup and compact Chinese hierarchy.
- Spacing and layout rhythm: implemented to the 520 × 640 px reference composition, including the centered brand, three-step flow, and full-width primary action.
- Colors and visual tokens: uses the supplied background image and cyan/teal interaction palette from the reference.
- Image quality and asset fidelity: uses the supplied logo, background, and Blur thumbnail as bundled project assets.
- Copy and content: includes a positive supporter-skin introduction and the requested three-step acquisition flow.

## Findings

- [P2] Browser-rendered visual comparison is pending because the local preview server was unavailable during capture.

## Implementation checklist

- [x] Use supplied background, logo, and Blur thumbnail.
- [x] Add selected, unselected, disabled, and future-wrapping skin option states.
- [x] Add device-code copy action and license verification flow.

final result: blocked
