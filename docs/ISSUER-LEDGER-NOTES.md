# Issuer ledger notes

- The independent offline maintainer issuer lives in `tools/maintainer-issuer/` and is not bundled into the end-user Quota Float installer.
- Its ledger page records the order name, order number, issue time, device request code, skin, and license ID in `Documents\Quota Float Maintainer Issuer\issuance-ledger.json`. The existing CSV ledger remains available.
- Cancelling a record is explicitly a local operating record only. It does not invalidate an already activated client license. Genuine revocation requires an online revocation list or licensing service.
- Blur healthy, caution, and critical artwork is copied from `效果/` into `assets/blur/`. The desktop widget and design workbench share those bundled assets and styles, so updates appear in both automatically.
- Computer and Blur error-state copy explicitly overrides dark-theme inheritance: the heading uses the skin ink color and supporting copy uses the matched muted ink color for signed-out, unavailable, and stale states on both Windows and macOS.
