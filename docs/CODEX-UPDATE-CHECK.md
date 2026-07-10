# Codex Update Check

This project depends on Codex Desktop local auth and private quota responses. Most Codex updates should not affect the app, but these changes can break quota reading:

- `CODEX_HOME` or `~/.codex/auth.json` changes shape.
- The access token no longer includes a usable ChatGPT account id.
- `https://chatgpt.com/backend-api/wham/usage` changes path, auth headers, or JSON fields.
- `https://chatgpt.com/backend-api/wham/rate-limit-reset-credits` changes path, auth headers, or JSON fields.

## Fast Command

Run this after Codex Desktop updates:

```powershell
npm.cmd run check:codex
```

The script records the last Codex executable fingerprint in `.codex-update-check-state.json`. If the fingerprint is unchanged, it exits quickly. To force a full run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-codex-update.ps1 -Force
```

To skip the live quota API probe and only run local tests/build:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-codex-update.ps1 -Force -SkipLive
```

## What It Checks

The automated check does four things:

1. Detects the installed Codex executable under `%LOCALAPPDATA%\OpenAI\Codex\bin` or `PATH`.
2. Runs frontend tests: `npm.cmd run test`.
3. Runs Rust parser tests: `cargo test` inside `src-tauri`.
4. Runs the production web build: `npm.cmd run build`.
5. Reads Codex auth without printing tokens, probes the quota endpoints, and verifies that the 5h quota window is recognizable.

The script does not save raw quota responses, tokens, account ids, prompts, or chat history.

## How To Read Failures

- `Codex auth file was not found`: sign in to Codex Desktop first.
- `access token was not found`: Codex changed `auth.json` or the login expired.
- `401` or `403` from the live probe: sign in again; if it persists, Codex auth headers may have changed.
- `Quota response is missing a recognizable 5h window`: update `src-tauri/src/codex.rs` parsing logic.
- Frontend/Rust/build failures: fix normal project regressions before blaming Codex.

## Optional Auto-Run

Codex Desktop does not expose a stable public post-update hook. The practical automation is to run this script at Windows login or once per day. It is cheap because it skips full checks when the Codex fingerprint has not changed.

Suggested Task Scheduler action:

```text
powershell.exe -ExecutionPolicy Bypass -File "D:\AI\额度插件\scripts\check-codex-update.ps1"
```

Use a trigger such as "At log on" or a daily trigger. If Codex changed, the script runs the full check and records the new fingerprint only after success.

## Manual Smoke Test

After a full check passes, start the desktop app and confirm:

- A signed-in Codex account shows real 5h quota, weekly quota, and reset time.
- Reset credits show when the service provides them.
- Signing out of Codex Desktop shows a safe login message, not raw token or response data.
- Refresh, tray menu, lock/unlock, always-on-top, and drag still work.
