# User Feedback Tracker

> Scope note: this tracker is maintained only for tool fixes, regression follow-up, and feature upgrades. Version testing, builds, uploads, packaging, and release workflows do not need to read or scan this file or its generated Excel workbooks. This boundary avoids unnecessary token use and repository scanning during release work.

| Time | Problem Version | Feedback | Problem Type | Fix | Current Version Solved | Resolution Status | Notes / Evidence | Reappeared Later | Manual QA |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-10 | 0.1.3 Windows | Right side of expanded card can lose visible rounded corners when the widget is near the desktop edge. | Window positioning / clipping | Expansion is computed in the Tauri backend using physical pixels and current monitor bounds. The window now uses a 4px transparent safe inset while keeping the visible card/orb edge snapped to the monitor edge. | Code implemented; pending user confirmation | Ready for QA | Screenshots recorded in the bilingual Excel tracker. Local Windows build and automated tests must pass before release. | Pending observation | Re-test right-edge and bottom-right docking on the packaged app. |
| 2026-07-10 | 0.1.3 Windows | Right-edge expansion can render off-screen or clip inside a small window. | Interaction / layout | When right-side space is insufficient, the card keeps the orb's right edge and opens left; when bottom-side space is insufficient, it opens upward. Hover collapse is delayed to avoid interrupting expansion during window movement. | Code implemented; pending user confirmation | Ready for QA | Screenshots recorded in the bilingual Excel tracker. Geometry now uses the visible content bounds, not the transparent window bounds. | Pending observation | Re-test right-edge and bottom-right docking on the packaged app. |
| 2026-07-10 | 0.1.3 Windows | Some users report white edges around the floating card/orb. | Visual polish / transparent window rendering | Reduced high-contrast white borders, switched to subtle inner strokes, added background clipping, disabled user resizing, and added a 4px transparent safe inset so rounded-edge antialiasing is not drawn directly on the OS window boundary. | Code implemented; pending user confirmation | Ready for QA | Screenshots recorded in the bilingual Excel tracker. | Pending observation | Inspect against light and dark wallpapers. |
| 2026-07-10 | 0.1.3 macOS | macOS shows white square corners outside the rounded card/orb; screenshots show the transparent window area rendered as white around all four corners. | macOS transparent window rendering | Enabled Tauri `app.macOSPrivateApi`, set the widget window `backgroundColor` to `#00000000`, and added a 4px transparent safe inset around the rounded UI. | Code implemented; pending macOS confirmation | Ready for macOS QA | User-provided WXWork screenshots: `65cc2c04-c178-45b8-bddb-15a399fbb1bb.jpg`, `4b0e44ab-bf1d-4813-996d-35e4637d6dda.jpg`. macOS version still unknown and must be captured during QA. | Pending observation | Run macOS CI artifact on a Mac and record `sw_vers`, app version, expanded/collapsed screenshots on light and dark wallpapers. |
| 2026-07-21 | 0.2.0 macOS | The expanded default dark card shows a thin gray rectangular frame outside its rounded edge. The supplied screenshot confirms the frame is outside the card design. | macOS transparent window compositing | **Approved, not yet implemented:** use one shared `0px` transparent safe inset for the default widget in both frontend geometry and Tauri window geometry. Do not alter card border, shadow, gradient, or any other visual design. | Pending implementation | Recorded for next fix | The current 4px safe inset leaves an uncovered transparent window band; macOS can composite that band as gray, which has high contrast only around the dark card. The target behavior is no external window band. | N/A | On a Mac, test default light and dark cards in collapsed/expanded states, including all screen edges and corners; confirm neither gray outer frame nor white square corners return. |
| 2026-07-10 | 0.1.3 Windows/macOS | A slight clipped/cut edge can still appear around the floating card/orb. | Visual polish / window edge clipping | Added a transparent safe inset and updated backend geometry so the inset can sit outside the monitor edge while the visible rounded card/orb remains visually docked. | Code implemented; pending user confirmation | Ready for QA | Needs repeat screenshots after the safe-inset build. | Pending observation | Check right-edge dock, expanded hover, collapsed hover, and bottom-right corner at 100%, 125%, and 150% scale where available. |
| 2026-07-14 | 0.1.5 Windows/macOS | The visual tuner needs a faithful dark-mode preview to review the shared React card and orb without maintaining platform-specific duplicates. | New feature / design validation | Added a Light / Dark toggle to the design playground and a `theme=dark` screenshot parameter. Dark styling is scoped to preview classes; production widget defaults remain unchanged. | Code implemented; pending visual review | Ready for QA | Verify all card states, weekly fallback, and orb in both preview themes. | Pending observation | Run `npm.cmd run build`; inspect `?designer&theme=dark` and screenshot modes. |
| 2026-07-14 | 0.1.5 Windows/macOS | No existing donation link, QR code, or payment configuration was found; an inactive donation control would be misleading. | New feature / monetization configuration | Donation entry is recorded as a pending configuration item. Do not render an in-app donation action until a public destination and supported payment method are supplied. | Awaiting configuration | Blocked by missing destination | Required configuration: public URL or QR image, supported payment method, display language, and any regional/compliance copy. | N/A | After configuration is supplied, validate that the link/QR opens correctly and add it to the privacy/release review. |

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

## macOS Runtime Verification Policy

Windows cannot execute or visually validate a macOS `.app` bundle. The reliable path is:

- On Windows: run TypeScript, Rust, Windows package, audit, and code/config checks.
- In CI: build on `macos-latest` with `npm run tauri -- build --target universal-apple-darwin`; this verifies the macOS toolchain, Rust target setup, bundling, and artifact upload.
- On a Mac: install the CI artifact and run the manual smoke checklist above. This is the only valid runtime/visual confirmation for the macOS transparent-window bug.
