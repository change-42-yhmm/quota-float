# Smart Inward Expansion Design

## Context

Quota Float currently changes the widget from `100 x 100` to `320 x 320` by calling `setSize` while leaving the window's top-left coordinate unchanged. Windows therefore renders every expansion toward the lower-right, regardless of where the orb sits. This feels restrictive and can push the expanded card beyond the current monitor's usable area.

## Goal

Make the floating orb expand toward the interior of the monitor that currently contains it, then return to the exact pre-expansion orb position when it collapses.

## Requirements

- Before expanding, capture the orb window's exact outer position.
- Determine the current monitor and use its work area, not its full bounds, so the taskbar and reserved desktop regions are respected.
- Compare available horizontal space on the left and right of the orb.
- Compare available vertical space above and below the orb.
- Expand toward the side with more available space on each axis.
- Clamp the final expanded window rectangle to the monitor work area.
- On collapse, resize to `100 x 100` and restore the captured physical position exactly.
- Preserve correct behavior under non-100% display scaling and on monitors whose coordinates may be negative.
- Serialize rapid expand and collapse requests so quick pointer movement cannot overwrite the saved orb position or leave the window in the wrong state.
- Keep quota fetching, visual styling, dragging, pinning, language switching, and preference persistence unchanged.

## Non-goals

- No user-selectable fixed expansion direction.
- No new settings or tray-menu items.
- No animation redesign.
- No changes to quota endpoints, authentication, or data parsing.
- No attempt to preserve a position to which the user drags the expanded card; collapse returns to the position captured immediately before expansion.

## Considered Approaches

### 1. Available-space anchoring (selected)

Choose the expansion direction independently on each axis using the current monitor's available work area. This gives intuitive behavior near every edge and works with different monitor layouts.

### 2. Down-right expansion with overflow correction

Keep the current behavior and shift the window only when it would leave the monitor. This is simpler but still feels directionally biased and can cause inconsistent jumps.

### 3. Centered expansion with clamping

Keep the orb center stable, then clamp the card inside the monitor. This looks balanced in open space but causes unnecessary movement near edges and does not preserve an intuitive edge anchor.

## Placement Model

All position calculations use physical pixels because Tauri's outer window position and monitor work-area coordinates are physical. The logical widget sizes are converted using the current window scale factor.

Given:

- original physical position `(orbX, orbY)`
- collapsed physical size `(orbWidth, orbHeight)`
- expanded physical size `(cardWidth, cardHeight)`
- monitor work area `(workX, workY, workWidth, workHeight)`

Calculate:

- `leftSpace = orbX - workX`
- `rightSpace = workX + workWidth - (orbX + orbWidth)`
- `topSpace = orbY - workY`
- `bottomSpace = workY + workHeight - (orbY + orbHeight)`

Horizontal placement:

- if `rightSpace >= leftSpace`, retain `orbX` and expand right
- otherwise use `orbX - (cardWidth - orbWidth)` and expand left

Vertical placement:

- if `bottomSpace >= topSpace`, retain `orbY` and expand down
- otherwise use `orbY - (cardHeight - orbHeight)` and expand up

Finally clamp the calculated top-left position so the expanded rectangle remains inside the monitor work area. Ties intentionally favor the existing right/down behavior to minimize movement near the monitor center. If a work-area dimension is smaller than the expanded card, align that axis to the work-area origin; complete containment is impossible in that case, but the placement remains deterministic.

## Architecture

### Pure placement calculation

Add a small TypeScript module responsible only for calculating the expanded physical position. It accepts plain numeric rectangles and returns a numeric position. It must not import Tauri APIs, which keeps the algorithm deterministic and easy to test.

### Window bridge

Extend `setWidgetExpanded` in `src/lib/bridge.ts` to:

1. Read the current outer position, outer size, scale factor, and current monitor.
2. Store the original physical position for the active expand-collapse cycle.
3. Calculate the inward expanded position.
4. Apply the expanded size and calculated position.
5. On collapse, apply the collapsed size and restore the stored position.

Only one saved position is needed because Quota Float has one widget window. A module-level transition queue serializes asynchronous Tauri window operations, preventing overlapping hover events from racing.

### Tauri capability

Add `core:window:allow-set-position` to the widget capability. Existing permissions for reading the outer position and setting size remain unchanged.

## State Transitions

### Expand

`collapsed -> capture position -> inspect monitor -> calculate target -> resize/reposition -> expanded`

Repeated expand requests while already expanded must not overwrite the saved orb position.

### Collapse

`expanded -> resize to collapsed size -> restore saved position -> clear saved position -> collapsed`

Repeated collapse requests with no saved position perform only the existing size change and otherwise remain harmless. The saved position is cleared only after a successful restore so a failed operation can be retried.

## Error Handling

- If the app is running in browser preview, retain the existing no-op behavior.
- If the current monitor cannot be determined, resize using the existing behavior and retain the saved position for collapse.
- If reading position, scale, or size fails, resize without repositioning.
- If repositioning fails after resize, surface the existing `Widget expand failed` or `Widget collapse failed` operation notice through the current caller.
- Never let placement errors affect quota data, preferences, or application startup.

## Testing

### Unit tests for placement calculation

- orb near top-left expands right and down
- orb near top-right expands left and down
- orb near bottom-left expands right and up
- orb near bottom-right expands left and up
- orb centered in the work area favors right and down on ties
- expanded position is clamped inside a work area smaller than the ideal rectangle
- negative monitor origins are handled correctly
- 125%, 150%, and 200% scale factors produce correct physical deltas
- taskbar-reduced work areas are respected
- a work area smaller than the card produces deterministic origin alignment

### Existing checks

- `npm test`
- `npm run build`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm run tauri -- build` on Windows or the repository CI equivalent

### Manual acceptance checks

- Drag the orb near each corner and confirm the card grows inward.
- Move the orb between monitors with different scaling and repeat the corner checks.
- Confirm the orb returns to the exact captured position after every collapse.
- Confirm repeated hover cycles do not cause position drift.
- Move the pointer rapidly in and out and confirm the final window state matches the final pointer state.
- Confirm the expanded card remains inside the current monitor's usable work area.

## Acceptance Criteria

- The widget no longer always expands toward the lower-right.
- The expanded card stays within the current monitor work area whenever that work area can contain the card.
- Collapse returns the orb to the exact position recorded before expansion.
- Repeated expansion and collapse do not drift the orb position.
- Existing quota display and widget controls continue to pass their tests and build successfully.
