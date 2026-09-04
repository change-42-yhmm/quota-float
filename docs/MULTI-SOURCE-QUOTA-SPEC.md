# Multi-source quota and API-cost specification

## Purpose

Quota Float will support four separate, explicitly labelled data sources:

1. **Codex subscription** — the existing local Codex Desktop login source.
2. **Claude subscription** — a local Claude Code subscription source.
3. **OpenAI API costs** — an opt-in, read-only cost source for a user who has permission to create a read-only OpenAI Admin API key.
4. **Claude API costs** — an opt-in, read-only cost source for a user who is authorized to access Anthropic's organization-level Cost Report.

These sources are not interchangeable. Subscription sources show remaining allowance and reset times. The API source shows billed cost. The product must never use API token usage, rate limits, or model pricing to fabricate a subscription-style remaining percentage.

## Product rules

### Source selection

- Codex is detected from the existing local Codex Desktop login state.
- Claude is discoverable only when a local Claude Code credential store exists. The app must not read its token or call the provider until the user chooses **Connect Claude subscription**.
- OpenAI API costs are never auto-detected. The user explicitly chooses **Connect OpenAI API costs**.
- Claude API costs are never auto-detected. The user explicitly chooses **Connect Claude API costs**. The app must not reuse a Claude Code credential, a local API-key file, or any token it finds on the machine.
- When several connected sources are available, the default card is the source with the earliest locally recorded `connectedAt` time.
- Selecting another source using the card navigation controls stores it as `activeSource`. That selection persists until the user explicitly selects another source or disconnects it.
- The card never auto-rotates between sources.

### Scope exclusions

The product does not support API administration. It must not create or edit projects, set spend limits, change rate limits, manage members, or expose team-wide management controls. It only reads cost data after explicit authorization.

The product does not show RPM/TPM, API rate-limit reset times, project budgets, or a synthetic "API remaining" value.

## Data-source contracts

### Codex subscription

| Item | Source | Card meaning |
|---|---|---|
| Short-window remaining percentage | Existing Codex usage response | Main percentage and progress |
| Weekly remaining percentage | Existing Codex usage response | Footer percentage |
| Reset timestamp | Existing Codex usage response | Countdown and exact time |
| Plan and reset credits when supplied | Existing Codex responses | Header / optional footer |

No behavior change is required for the existing Codex source.

### Claude subscription

#### Connection

1. The source manager may show **Claude Code detected** after finding the local credential-store path.
2. The user selects **Connect Claude subscription**.
3. A consent sheet explains that the app will read the local Claude Code login token solely to request current usage from Anthropic, will not copy it into preferences or logs, and can be disconnected at any time.
4. After consent, the app fetches the subscription usage snapshot. It never refreshes or writes back the Claude credential itself.

#### Read-only fields and UI mapping

| Source field | Product field | Existing card position |
|---|---|---|
| Five-hour utilization | `100 - utilization` | Main remaining percentage and progress |
| Five-hour reset time | Reset timestamp | Countdown / exact reset time |
| Seven-day utilization | `100 - utilization` | Weekly remaining footer |
| Seven-day reset time | Weekly reset timestamp | Footer date |
| Local subscription type, when present | Plan | Header |

The Claude card uses the same layout as the Codex subscription card. It does not display internal compatibility labels. It has no reset-credit row because the source does not provide an equivalent product concept.

#### Reliability behavior

- Refresh on user request, focus, and the existing low-frequency refresh schedule.
- On transient failure, retain the last successful snapshot as stale and show its age.
- On an invalid or expired login, show a provider-neutral sign-in message and stop using stale values as if they were current.
- A failure must never print the credential, response body, file path, or HTTP headers.

### OpenAI API costs

#### Eligibility and authorization

This source is only available when the user can obtain a **read-only Admin API key** for the relevant OpenAI API organization. This may be an individual who owns their own organization or a user authorized by that organization. A normal model-calling API key is not sufficient for organization-level cost reporting.

The product uses the Admin API key only to read cost data. It does not provide administrator features.

#### Data source

Read the official OpenAI organization Costs endpoint for a UTC time range:

- Current calendar month: main metric.
- Current UTC day: footer metric.
- Latest successful request time: sync disclosure.

The Costs endpoint returns billed amounts and currency. Do not calculate the displayed money value from token counts. See the [OpenAI Usage and Costs API](https://developers.openai.com/api/reference/python/resources/admin/subresources/organization/subresources/usage).

#### UI mapping

| Existing card element | OpenAI API-cost content |
|---|---|
| Header | `OPENAI API` |
| Main number | `$12.34` (the current calendar month's billed API cost) |
| Main label | `本月 API 已使用` |
| Reset-time row | `今日已使用 $0.83` |
| Footer | `同步于 12:34` |
| Percentage, progress bar, weekly percentage | Hidden |
| Reset countdown and reset credits | Hidden |

The UI must not use `API 剩余`, `总 token`, `本月重置`, or `余额` for this source. Those terms are either inaccurate or depend on billing features outside this product's scope.

#### Authorization interface

Add a source-manager entry named **OpenAI API costs**. Selecting it opens a modal; it must never appear automatically after a Codex sign-in is detected.

**Chinese modal copy**

```
连接 OpenAI API 成本

将读取
• 本月 API 已使用金额
• 今日 API 已使用金额

不会读取或执行
• 提示词、对话、模型输出或请求内容
• API 调用、项目、成员、预算或限流的修改

需要一个只读 OpenAI Admin API Key。
请在 OpenAI API Platform 创建最小权限的只读密钥，然后粘贴到此处。

[前往 OpenAI 创建密钥] [粘贴并验证] [取消]
```

**Connection flow**

1. Open the OpenAI API Platform Admin Keys page in the user's browser.
2. The user creates a minimum-scope, read-only Admin API key.
3. The user pastes it into the modal.
4. The app performs one read-only cost query to verify access.
5. On success, store the key only in the operating system credential vault, record the source `connectedAt`, and refresh the API-cost card.
6. A **Disconnect** action deletes the vault entry and all API-cost snapshots held by the app.

The app must never scan environment variables, browser cookies, source code, terminal history, or existing API-key files. It must not put the key in `preferences.json`, backups, telemetry, or logs.

### Claude API costs

#### Eligibility and authorization

This source is only available to a user authorized to access the Anthropic organization-level **Cost Report**. The ordinary Claude API key or the local Claude Code sign-in token must not be silently repurposed for this source: neither establishes that the user may read organization-wide cost data. The connection flow must ask the user to supply an appropriately scoped, read-only organization credential explicitly, verify it with one read-only report request, and store it only in the operating-system credential vault.

The product does not create keys, adjust spend limits, or expose the Anthropic Console. It only reads the Cost Report after explicit authorization.

#### Data source

Read Anthropic's official `GET /v1/organizations/cost_report` endpoint for a UTC time range:

- Current calendar month: main metric.
- Current UTC day: footer metric.
- Latest successful request time: sync disclosure.

The report returns daily buckets whose results contain a direct `amount` and `currency`; sum only those returned amounts in their reported currency. Do not reconstruct cost from the Usage Report, token counts, or the published model-price table. The card labels this as **API cost**, not account balance, credit balance, remaining budget, or subscription allowance.

#### UI mapping

| Existing card element | Claude API-cost content |
|---|---|
| Header | `CLAUDE API` |
| Main number | `$12.34` (current calendar month's API cost) |
| Main label | `本月 API 成本` |
| Reset-time row | `今日 API 成本 $0.83` |
| Footer | `同步于 12:34` |
| Percentage, progress bar, weekly percentage | Hidden |
| Reset countdown and reset credits | Hidden |

The Claude and OpenAI cost cards use the same money-first information architecture. They remain distinct sources and must retain their provider mark, name, authorization state, and connection metadata.

#### Authorization interface

Add a source-manager entry named **Claude API costs**. It must never appear as an automatic prompt after Claude Code is detected or Codex is signed in.

**Chinese modal copy**

```
连接 Claude API 成本

将读取
• 本月 API 成本
• 今日 API 成本

不会读取或执行
• 提示词、对话、模型输出或请求内容
• API 调用、工作区、成员、消费限额或限流的修改

需要具备组织 Cost Report 读取权限的只读 Anthropic 凭证。
请在 Anthropic Console 创建最小权限的只读凭证，然后粘贴到此处。

[前往 Anthropic Console] [粘贴并验证] [取消]
```

On success, record `connectedAt`, refresh the cost card, and offer **Disconnect**. Disconnect deletes the vault entry and all Claude API-cost snapshots. It must not disconnect or alter the separate Claude subscription source.

## Source-management UI

Add a lightweight source-management panel accessible from the existing card controls or tray menu. It lists:

| Source | State examples | Primary action |
|---|---|---|
| Codex subscription | Connected / Sign in required | Refresh |
| Claude subscription | Detected / Connected / Sign in required | Connect / Disconnect |
| OpenAI API costs | Not connected / Connected / Access needs attention | Connect / Disconnect |
| Claude API costs | Not connected / Connected / Access needs attention | Connect / Disconnect |

Only connected sources appear in the card-navigation cycle. A disconnected or detected-only source is never queried for quota data.

## Data model direction

Replace the assumption that every provider produces `shortWindow` and `weeklyWindow` with a discriminated display type:

```ts
type SourceKind = "codexSubscription" | "claudeSubscription" | "openaiApiCosts" | "claudeApiCosts";

type SubscriptionSnapshot = {
  kind: "codexSubscription" | "claudeSubscription";
  shortWindow: UsageWindow | null;
  weeklyWindow: UsageWindow | null;
  plan: string | null;
};

type ApiCostSnapshot = {
  kind: "openaiApiCosts" | "claudeApiCosts";
  monthCost: Money;
  dayCost: Money;
  updatedAt: string;
};
```

Preferences should store source connection metadata only, for example `activeSource` and `connectedAt`. Secrets belong only in the operating system credential vault.

## Implementation sequence

1. Define the source and snapshot types; migrate the existing Codex source without visual changes.
2. Add source metadata, persistent active-source selection, and the source-management panel.
3. Add the Claude adapter, consent sheet, provider-neutral error copy, and adapter tests using fixture responses.
4. Add the OpenAI and Claude API-cost authorization modals and credential-vault integration.
5. Add the two read-only Cost Report adapters and the shared API-cost card variant.
6. Update privacy documentation, product copy, and the test matrix.

## Acceptance checks

- With only Codex connected, behavior is unchanged.
- With Codex and Claude connected, the earliest connected source is shown first; a manual source change persists after restart.
- Claude is never queried before the user connects it.
- OpenAI API costs are never prompted automatically and never inferred from local keys or browser state.
- Claude API costs are never prompted automatically and never inferred from Claude Code or local credentials.
- The API-cost card contains money and sync time only; it contains no percentage, token estimate, rate-limit value, reset countdown, or budget-management control.
- Revoking or disconnecting any optional source removes its credentials from the vault and removes it from card navigation.
- Logs, preferences, backups, error messages, and screenshots contain no token, API key, raw credential, or raw quota response.
