# Local adversarial review — 2026-09-09

Baseline saved as 947b54c before review. Three independent agents reviewed privacy, release size and licensing, followed by cross-review of fixes.

## Implemented
- Keep DesignPlayground, its controls and original backgrounds in source. DEV-only lazy loading excludes them from production. A build guard rejects preview backgrounds, design workbench content and source maps in dist.
- Move development-only CSS out of the shared stylesheet; preserve production skin rendering rules.
- Replace the preview device fingerprint with an explicitly fictitious DEMO value and remove a machine-specific documentation path. Public supporter contact details are intentionally retained.
- Ignore preference event payloads and read authoritative Rust preferences instead. Deny renderer emit/emitTo in the consumer widget capability; native backend events remain allowed.
- Use strict Ed25519 verification and the absolute macOS ioreg path. License format and device hashing remain unchanged.

## Verification and limits
19 frontend tests and 22 Rust tests passed, including forged event payload rejection and normal signatures for all four skins. Production build passed. Development workbench and background switching were checked in-browser. Agents found no tracked signing keys or common credentials, no common image metadata leakage, and no issuer resources included in the consumer frontend. The updater private key path is ignored and untracked; its contents were not read.

Frontend assets decreased from 22,189,368 to 4,666,395 bytes (about 79%). This is not a measurement of installer compression. No new installer was produced or unpacked; macOS behavior still needs a native smoke test. Offline assets and rendering can still be extracted or patched by someone controlling the machine. This is hardening, not unbreakable DRM.

## Deferred
Rust size profiles and font conversion need measured release builds and visual verification before adoption. A pre-existing supporter-window event capability issue was noted by review; unrelated permissions were not broadened. No server activation, key rotation, license-format migration, or user-data upload was introduced.
