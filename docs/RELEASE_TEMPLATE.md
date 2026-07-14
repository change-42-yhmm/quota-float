# Quota Float 0.1.8

Quota Float is a lightweight floating desktop widget for checking Codex quota from the local Codex Desktop login state.

## Downloads

- Windows unsigned: `quota-float-windows-unsigned.zip`
- macOS Universal unsigned: `quota-float-macos-universal-unsigned.zip`
- SHA-256 checksums: `SHA256SUMS.txt`

## What's new

- Adds a top-left compact button that switches directly between the 320x320 expanded panel and the 100x100 compact panel.
- Keeps both visual states ready so the native window and interface change together without a visible resize-then-move sequence.
- Persists the selected panel mode and keeps rapid toggles serialized.
- Improves host-following window placement and compact-state error feedback.
- Removes the misleading draggable cursor and manual drag capability so the panel stays fixed.

## Install

1. Sign in to Codex Desktop on the same machine.
2. Download the package for your platform.
3. Unzip the package and run the app.

### macOS unsigned app note

This macOS build is unsigned and not notarized. If macOS blocks the first launch:

1. Right-click the app and choose Open.
2. Choose Open again in the system prompt.
3. If needed, allow the app in System Settings -> Privacy & Security.

## Privacy

Quota Float does not store Codex tokens, account IDs, prompts, chats, raw quota responses, or local auth paths. It stores only widget preferences. See `PRIVACY.md`.

## Notes

- This release is unsigned. Windows may show an unknown publisher warning; macOS may show a Gatekeeper warning.
- Codex quota is read from non-public quota service responses and may stop working if the response shape changes.
- The app shows stale/unavailable states instead of estimating quota.
- Windows and macOS builds share the same React/CSS UI and behavior layer.

## Release checks

- [ ] Frontend tests passed.
- [ ] Rust tests passed.
- [ ] Web build passed.
- [ ] Windows MSI and NSIS bundles generated and installation-checked.
- [ ] macOS Universal app and DMG generated and installation-checked.
- [ ] Version consistency, archive contents, SHA-256 hashes, and privacy scan passed.
- [ ] Draft attachments reviewed before publishing.
