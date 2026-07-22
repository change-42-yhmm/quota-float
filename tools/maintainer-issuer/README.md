# Quota Float Maintainer Issuer

An offline-only desktop utility for maintainers to issue Quota Float supporter licenses. It is intentionally a separate Tauri application and is never built as part of the user-facing `Quota Float` package.

## Build and run

From this directory:

```powershell
npm ci
npm run tauri dev
# or
npm run tauri build
```

The private key is selected from a local file for a single signing action. It is not persisted in settings, emitted in logs, included in the resulting license, or bundled as an application resource.

The generated JSON is compatible with the existing `tools/license-cli` and the production application's verifier.

## Issuance ledger

Every successful issuance is appended locally to `Documents\Quota Float Maintainer Issuer\issuance-ledger.csv`. The UTF-8 CSV opens directly in Excel and records the issue time, buyer/order note, skin, complete device request code, license ID, and key ID. It never records the private key or license JSON.
