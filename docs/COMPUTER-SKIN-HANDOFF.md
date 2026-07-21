# Computer skin handoff

## Current implementation

### Ownership

- `src/components/QuotaCard.tsx` selects Computer assets for expanded cards and collapsed orbs.
- `src/styles.css` owns Computer geometry, typography, positioning, and visual layering.
- `src/components/DesignPlayground.tsx` exposes review states at `http://localhost:1421/?design=1`.

### Expanded card

- Base: `assets/computer-bg.svg`.
- Healthy/caution/critical title stripe: `assets/computer-stripes.svg`.
- Unavailable/stale/signed-out title stripe: `assets/computer-stripes-error.svg`, in exactly the same position as the normal stripe.
- Main number: `Computer Bitcount`, `76px`, `letter-spacing: 1px`.
- Percent sign: `29px`, adjusted down to visually align with the number baseline.
- GPT logo: `assets/computer-gpt-logo.svg`; current placement is `right: 1px; bottom: 9px`.

The Computer error-state artwork has no circular button background:

| Status | Artwork |
| --- | --- |
| Unavailable | `assets/computer-error-unavailable.svg` |
| Stale | `assets/computer-error-stale.svg` |
| Signed out | `assets/computer-error-signedout.svg` |

### Collapsed orb

- Base body: `assets/computer-orb-base.svg` (native 72 × 72).
- The visible Computer orb is scaled to `1.11` within its existing 4px safe margin, so it fills the available 80px footprint.
- Computer clears the default glass orb background, border, shadow, and backdrop filter. Transparent SVG areas must remain transparent; do not fill unused canvas area with white.
- All screens share one aperture: `left: 14.4px`, `top: 12.4365px`, `width: 43.2px`, `height: 33.3818px`.

| State | Screen asset | Centre content |
| --- | --- | --- |
| Healthy | `assets/computer-orb-screen-healthy.svg` | Live number |
| Caution | `assets/computer-orb-screen-caution.svg` | Live number |
| Critical | `assets/computer-orb-screen-critical.svg` | Live number |
| Unavailable | `assets/computer-orb-screen-error.svg` | `assets/computer-error-unavailable.svg` |
| Stale | `assets/computer-orb-screen-error.svg` | `assets/computer-error-stale.svg` at 0.9× |
| Signed out | `assets/computer-orb-screen-error.svg` | `assets/computer-orb-gpt.svg` |

Healthy, caution, and critical numbers omit `%`, use `27px` with `letter-spacing: 0.5px`, and use the shared correction `translate(1px, 2px)`. Their colours are Healthy `#1F4176`, Caution `#B36607`, and Critical `#E83D13`.

### Design review and verification

In the design playground, select **Computer skin**. Review all expanded states plus **Healthy orb**, **Caution orb**, **Critical orb**, **Weekly orb**, **Unavailable orb**, **Stale orb**, and **Signed out orb**.

Before handing off a visual change:

1. Keep all screen assets on the shared aperture; do not add error-only positioning.
2. Verify one-, two-, and three-digit quota values, plus every error orb.
3. Keep the Computer orb transparent outside its supplied artwork.
4. Run `npm.cmd run build`.
