# Quota Float license CLI

This is an offline maintainer tool. Do not run it on a customer device and never commit a private key, issued license, or completed ledger.

Generate an Ed25519 key pair once on an offline maintainer machine:

```powershell
cargo run --manifest-path tools/license-cli/Cargo.toml -- generate-key --key-id supporter-v1
```

Store the printed private key in an offline encrypted location. Set the printed public key as `QUOTA_FLOAT_LICENSE_PUBLIC_KEY` for the release build only. Sign a customer's displayed request code:

```powershell
cargo run --manifest-path tools/license-cli/Cargo.toml -- sign --skin-id blur|computer --device-hash QF1-XXXX-XXXX-XXXX-XXXX --private-key-file private.key
```

Use `ledger.example.csv` as a local, non-committed order ledger. It intentionally stores only a request-code prefix, never raw hardware IDs or the full license text.
