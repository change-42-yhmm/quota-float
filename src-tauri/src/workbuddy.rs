use std::{fs, path::PathBuf};

use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Value};

use crate::models::{ProviderSnapshot, UsageWindow, WorkBuddyPoints};

const USAGE_URL: &str = "https://copilot.tencent.com/v2/billing/meter/get-user-resource";
const MAX_AUTH_BYTES: u64 = 256 * 1024;
const SUBSCRIPTION_CODES: &[&str] = &[
    "TCACA_code_008_cfWoLwvjU4",
    "TCACA_code_002_AkiJS3ZHF5",
    "TCACA_code_023_4xbGhMrE6q",
    "TCACA_code_026_BaESVICNoi",
    "TCACA_code_027_0FCGVA6vSa",
];
const ADDON_CODES: &[&str] = &[
    "TCACA_code_007_nzdH5h4Nl0",
    "TCACA_code_028_NtpWi0jzXs",
    "TCACA_code_029_6wCGEWquYy",
    "TCACA_code_030_BjSt89qTvr",
];

struct Auth {
    access_token: String,
    user_id: String,
}

fn auth_path() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    // Mirror the shared CodeBuddyExtension auth layout on every platform
    // (same locations cockpit-tools uses for WorkBuddy login discovery).
    #[cfg(target_os = "macos")]
    let root = home.join("Library/Application Support/CodeBuddyExtension");
    #[cfg(target_os = "windows")]
    let root = home.join("AppData").join("Local").join("CodeBuddyExtension");
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let root = home.join(".local").join("share").join("CodeBuddyExtension");
    Some(
        root.join("Data")
            .join("Public")
            .join("auth")
            .join("workbuddy-desktop.info"),
    )
}

pub async fn fetch_snapshot(client: &reqwest::Client) -> ProviderSnapshot {
    let auth = match load_auth() {
        Ok(value) => value,
        Err(message) => {
            return ProviderSnapshot::failure_for("workbuddy", "WORKBUDDY", "signed_out", message)
        }
    };
    let subscriptions = match fetch_accounts(client, &auth, SUBSCRIPTION_CODES).await {
        Ok(value) => value,
        Err((status, message)) => {
            return ProviderSnapshot::failure_for("workbuddy", "WORKBUDDY", status, message)
        }
    };
    let addons = match fetch_accounts(client, &auth, ADDON_CODES).await {
        Ok(value) => value,
        Err((status, message)) => {
            return ProviderSnapshot::failure_for("workbuddy", "WORKBUDDY", status, message)
        }
    };
    let expiring_addon = expiring_addon(&addons);
    let monthly_remaining = sum_remaining(&subscriptions);
    let monthly_total = sum_total(&subscriptions);
    let addon_remaining = sum_remaining(&addons);
    let addon_total = sum_total(&addons);
    let expiring_addon_expires_at = expiring_addon
        .and_then(|account| timestamp(&account["DeductionEndTime"]))
        .and_then(|value| chrono::DateTime::from_timestamp_millis(value))
        .map(|value| value.to_rfc3339());

    ProviderSnapshot {
        provider: "workbuddy".into(),
        display_name: "WORKBUDDY".into(),
        plan: Some(package_name(&subscriptions)),
        short_window: Some(UsageWindow {
            remaining_percent: percent(monthly_remaining, monthly_total),
            resets_at: None,
            window_seconds: 2_592_000,
        }),
        weekly_window: Some(UsageWindow {
            remaining_percent: percent(addon_remaining, addon_total),
            resets_at: expiring_addon_expires_at.clone(),
            window_seconds: 0,
        }),
        reset_credits: None,
        reset_credit_expires_at: Vec::new(),
        workbuddy: Some(WorkBuddyPoints {
            monthly_remaining,
            monthly_total,
            addon_remaining,
            addon_total,
            expiring_addon_remaining: expiring_addon.map(remaining),
            expiring_addon_expires_at,
        }),
        updated_at: chrono::Utc::now().to_rfc3339(),
        status: "ok".into(),
        message: None,
    }
}

async fn fetch_accounts(
    client: &reqwest::Client,
    auth: &Auth,
    package_codes: &[&str],
) -> Result<Vec<Value>, (&'static str, &'static str)> {
    let response = client
        .post(USAGE_URL)
        .headers(headers(auth).map_err(|message| ("signed_out", message))?)
        .json(&json!({
            "PageNumber": 1,
            "PageSize": 200,
            "ProductCode": "p_tcaca",
            "Status": [0, 3],
            "OnlyValidPeriod": true,
            "PackageCodes": package_codes,
        }))
        .send()
        .await
        .map_err(|_| {
            (
                "unavailable",
                "WorkBuddy network is unavailable. It will retry automatically.",
            )
        })?;
    if !response.status().is_success() {
        return Err(match response.status().as_u16() {
            401 | 403 => (
                "signed_out",
                "WorkBuddy sign-in expired. Please sign in again.",
            ),
            429 => (
                "unavailable",
                "WorkBuddy service is rate limited. It will retry automatically.",
            ),
            _ => (
                "unavailable",
                "WorkBuddy service is temporarily unavailable.",
            ),
        });
    }
    response
        .json::<Value>()
        .await
        .map_err(|_| ("unavailable", "WorkBuddy response format has changed."))?["data"]["Response"]
        ["Data"]["Accounts"]
        .as_array()
        .cloned()
        .ok_or((
            "unavailable",
            "WorkBuddy response has no available packages.",
        ))
}

fn load_auth() -> Result<Auth, &'static str> {
    let path = auth_path().ok_or("WorkBuddy login directory was not found.")?;
    // The client drops a ".logged-out" marker next to the auth file after the
    // user signs out, so treat it as an expired session instead of stale data.
    if PathBuf::from(format!("{}.logged-out", path.to_string_lossy())).exists() {
        return Err("WorkBuddy sign-in expired. Please sign in again.");
    }
    let metadata = fs::metadata(&path).map_err(|_| "Please sign in to WorkBuddy first.")?;
    if !metadata.is_file() || metadata.len() > MAX_AUTH_BYTES {
        return Err("WorkBuddy login data is unavailable.");
    }
    let auth: Value = serde_json::from_str(
        &fs::read_to_string(&path).map_err(|_| "WorkBuddy login data could not be read.")?,
    )
    .map_err(|_| "WorkBuddy login format has changed.")?;
    Ok(Auth {
        access_token: normalize_access_token(
            auth["auth"]["accessToken"]
                .as_str()
                .ok_or("WorkBuddy sign-in expired. Please sign in again.")?,
        ),
        user_id: auth["account"]["uid"]
            .as_str()
            .ok_or("WorkBuddy user identifier is unavailable. Please sign in again.")?
            .to_owned(),
    })
}

// WorkBuddy access tokens may embed a uid prefix ("<uid>+<token>"); the API
// only accepts the part after the separator.
fn normalize_access_token(token: &str) -> String {
    let trimmed = token.trim();
    if let Some((_, suffix)) = trimmed.split_once('+') {
        let suffix = suffix.trim();
        if !suffix.is_empty() {
            return suffix.to_string();
        }
    }
    trimmed.to_string()
}

fn headers(auth: &Auth) -> Result<HeaderMap, &'static str> {
    let mut headers = HeaderMap::new();
    let mut bearer = HeaderValue::from_str(&format!("Bearer {}", auth.access_token))
        .map_err(|_| "WorkBuddy login data is invalid.")?;
    bearer.set_sensitive(true);
    headers.insert(AUTHORIZATION, bearer);
    let mut user_id = HeaderValue::from_str(&auth.user_id)
        .map_err(|_| "WorkBuddy user identifier is invalid.")?;
    user_id.set_sensitive(true);
    headers.insert("X-User-Id", user_id);
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    Ok(headers)
}

fn package_name(accounts: &[Value]) -> String {
    accounts
        .iter()
        .find_map(|account| account["PackageName"].as_str())
        .unwrap_or("WorkBuddy")
        .to_owned()
}

fn sum_remaining(accounts: &[Value]) -> f64 {
    accounts.iter().map(remaining).sum()
}
fn sum_total(accounts: &[Value]) -> f64 {
    accounts.iter().map(total).sum()
}
fn remaining(account: &Value) -> f64 {
    amount(&account["CycleCapacityRemainPrecise"])
}
fn total(account: &Value) -> f64 {
    amount(&account["CycleCapacitySizePrecise"])
}
fn percent(remaining: f64, total: f64) -> f64 {
    if total > 0.0 {
        (remaining / total * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    }
}

fn expiring_addon(accounts: &[Value]) -> Option<&Value> {
    accounts
        .iter()
        .filter(|account| remaining(account) > 0.0)
        .filter_map(|account| {
            timestamp(&account["DeductionEndTime"]).map(|expires_at| (expires_at, account))
        })
        .min_by_key(|(expires_at, _)| *expires_at)
        .map(|(_, account)| account)
}

fn amount(value: &Value) -> f64 {
    value
        .as_f64()
        .or_else(|| value.as_str().and_then(|number| number.parse().ok()))
        .unwrap_or(0.0)
}
fn timestamp(value: &Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_str().and_then(|timestamp| timestamp.parse().ok()))
}

#[cfg(test)]
mod tests {
    use super::{expiring_addon, normalize_access_token, percent, remaining, sum_remaining, sum_total, total};

    #[test]
    fn strips_the_uid_prefix_from_workbuddy_tokens() {
        assert_eq!(normalize_access_token("abc123+eyJ0b2tlbiJ9"), "eyJ0b2tlbiJ9");
        assert_eq!(normalize_access_token("eyJ0b2tlbiJ9"), "eyJ0b2tlbiJ9");
        assert_eq!(normalize_access_token("  plain-token  "), "plain-token");
        assert_eq!(normalize_access_token("uid+part1+part2"), "part1+part2");
        assert_eq!(normalize_access_token("uid+"), "uid+");
    }

    #[test]
    fn aggregates_monthly_and_addon_accounts() {
        let accounts = serde_json::json!([
            {"CycleCapacitySizePrecise": "3000", "CycleCapacityRemainPrecise": "2500"},
            {"CycleCapacitySizePrecise": 120, "CycleCapacityRemainPrecise": 80, "DeductionEndTime": 1787875200000i64},
            {"CycleCapacitySizePrecise": 3400, "CycleCapacityRemainPrecise": 2006, "DeductionEndTime": 1789000000000i64}
        ]).as_array().unwrap().to_vec();
        let addons = &accounts[1..];
        assert_eq!(sum_remaining(addons), 2086.0);
        assert_eq!(sum_total(addons), 3520.0);
        let first_expiring = expiring_addon(addons).unwrap();
        assert_eq!(remaining(first_expiring), 80.0);
        assert_eq!(total(first_expiring), 120.0);
        assert_eq!(percent(2500.0, 3000.0), 83.33333333333334);
    }

    #[test]
    fn skips_used_up_addons_when_finding_the_expiring_one() {
        let accounts = serde_json::json!([
            {"CycleCapacitySizePrecise": 120, "CycleCapacityRemainPrecise": 0, "DeductionEndTime": 1700000000000i64},
            {"CycleCapacitySizePrecise": 120, "CycleCapacityRemainPrecise": 80, "DeductionEndTime": 1787875200000i64},
            {"CycleCapacitySizePrecise": 3400, "CycleCapacityRemainPrecise": 2006, "DeductionEndTime": 1789000000000i64}
        ]).as_array().unwrap().to_vec();
        let first_expiring = expiring_addon(&accounts).unwrap();
        assert_eq!(remaining(first_expiring), 80.0);
        assert_eq!(total(first_expiring), 120.0);
    }

    #[test]
    fn returns_none_when_all_addons_are_used_up() {
        let accounts = serde_json::json!([
            {"CycleCapacitySizePrecise": 120, "CycleCapacityRemainPrecise": 0, "DeductionEndTime": 1700000000000i64},
            {"CycleCapacitySizePrecise": 3400, "CycleCapacityRemainPrecise": 0, "DeductionEndTime": 1789000000000i64}
        ]).as_array().unwrap().to_vec();
        assert!(expiring_addon(&accounts).is_none());
    }
}
