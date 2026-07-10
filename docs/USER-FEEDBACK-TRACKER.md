# User Feedback Tracker

| Time | Problem Version | Feedback | Problem Type | Fix | Current Version Solved | Resolution Status | Notes / Evidence | Reappeared Later | Manual QA |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-10 | 0.1.3 Windows | Right side of expanded card can lose visible rounded corners when the widget is near the desktop edge. | Window positioning / clipping | Expansion is computed in the Tauri backend using physical pixels and current monitor bounds. | Pending user confirmation | Pending | Screenshots recorded in the bilingual Excel tracker. | Pending observation | Pending manual QA |
| 2026-07-10 | 0.1.3 Windows | Right-edge expansion can render off-screen or clip inside a small window. | Interaction / layout | When right-side space is insufficient, the card keeps the orb's right edge and opens left; when bottom-side space is insufficient, it opens upward. Hover collapse is delayed to avoid interrupting expansion during window movement. | Pending user confirmation | Pending | Screenshots recorded in the bilingual Excel tracker. | Pending observation | Pending manual QA |
| 2026-07-10 | 0.1.3 Windows | Some users report white edges around the floating card/orb. | Visual polish / transparent window rendering | Reduced high-contrast white borders, switched to subtle inner strokes, added background clipping, and disabled user resizing to avoid transparent-window edge artifacts. | Pending user confirmation | Pending | Screenshots recorded in the bilingual Excel tracker. | Pending observation | Pending manual QA |
| 2026-07-10 | 0.1.3 macOS | macOS shows white square corners outside the rounded card/orb; screenshots show the transparent window area rendered as white around all four corners. | macOS transparent window rendering | Enabled Tauri `app.macOSPrivateApi` and set the widget window `backgroundColor` to `#00000000`, because Tauri/WKWebView transparency on macOS requires the private API flag. | Pending macOS confirmation | In progress | User-provided WXWork screenshots: `65cc2c04-c178-45b8-bddb-15a399fbb1bb.jpg`, `4b0e44ab-bf1d-4813-996d-35e4637d6dda.jpg`. macOS version still unknown and must be captured during QA. | Pending observation | Run macOS CI artifact on a Mac and record `sw_vers`, app version, expanded/collapsed screenshots on light and dark wallpapers. |
| 2026-07-10 | 0.1.3 Windows/macOS | A slight clipped/cut edge can still appear around the floating card/orb. | Visual polish / window edge clipping | Treat as related to transparent-window background and edge antialiasing first; verify after the macOS transparency fix before adding a larger transparent safe inset, because an inset could make right-edge docking look like it has a gap. | Pending user confirmation | In progress | Needs repeat screenshots after `macOSPrivateApi` + transparent `backgroundColor` build. | Pending observation | Check right-edge dock, expanded hover, collapsed hover, and bottom-right corner at 100%, 125%, and 150% scale where available. |

## Verification Checklist

Run after each fix:

```powershell
npm.cmd run test
cargo test --manifest-path src-tauri/Cargo.toml
npm.cmd run build
```

Manual Windows smoke test:

- Drag the collapsed orb to the far right edge; the visible orb should reach the edge without a 10px gap.
- Hover to expand near the right edge; the card should shift left and keep all rounded corners visible.
- Repeat near the bottom-right corner; the card should shift left/up.
- Inspect the card and orb against light and dark wallpapers; no obvious white rim should appear.
- Confirm tray, refresh, language, always-on-top, and dragging still work.

Manual macOS smoke test:

- Install the `quota-float-macos-universal-unsigned` artifact built by CI or Release.
- Record `sw_vers`, CPU architecture, display scale, and whether the build is Intel, Apple Silicon, or universal.
- Optional: run `bash scripts/macos-smoke-capture.sh "/Applications/Quota Float.app"` on a Mac to collect `system.txt` plus collapsed/expanded screenshots.
- Open the app on light and dark wallpapers; capture collapsed and expanded screenshots.
- Drag the orb to each screen edge and corner; hover to expand and move the mouse away to collapse.
- Confirm there is no white square background outside rounded corners and no visible clipped edge.
