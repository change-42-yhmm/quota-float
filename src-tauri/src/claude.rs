use std::{fs, path::PathBuf};

use chrono::Utc;
use reqwest::Client;
use serde_json::Value;

use crate::models::{ProviderSnapshot, UsageWindow};

fn credentials_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".claude").join(".credentials.json"))
}

pub fn is_detected() -> bool {
    credentials_path().is_some_and(|path| path.is_file())
}

fn oauth_credentials() -> Result<(String, Option<String>), String> {
    let path =
        credentials_path().ok_or_else(|| "Claude Code credentials were not found".to_string())?;
    let raw = fs::read_to_string(path)
        .map_err(|_| "Claude Code credentials were not found".to_string())?;
    let parsed: Value = serde_json::from_str(&raw)
        .map_err(|_| "Claude Code credentials could not be read".to_string())?;
    let oauth = parsed
        .get("claudeAiOauth")
        .ok_or_else(|| "Claude Code sign-in is required".to_string())?;
    let token = oauth
        .get("accessToken")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Claude Code sign-in is required".to_string())?;
    Ok((
        token.to_owned(),
        oauth
            .get("subscriptionType")
            .and_then(Value::as_str)
            .map(str::to_owned),
    ))
}

fn window(value: Option<&Value>, seconds: u64) -> Option<UsageWindow> {
    let value = value?;
    let utilization = value.get("utilization")?.as_f64()?.clamp(0.0, 100.0);
    Some(UsageWindow {
        remaining_percent: 100.0 - utilization,
        resets_at: value
            .get("resets_at")
            .and_then(Value::as_str)
            .map(str::to_owned),
        window_seconds: seconds,
    })
}

pub async fn fetch_snapshot(client: &Client) -> ProviderSnapshot {
    let result = async {
        let (token, plan) = oauth_credentials()?;
        let response = client
            .get("https://api.anthropic.com/api/oauth/usage")
            .header("authorization", format!("Bearer {token}"))
            .header("anthropic-beta", "oauth-2025-04-20")
            .send()
            .await
            .map_err(|_| "Claude quota request failed".to_string())?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED
            || response.status() == reqwest::StatusCode::FORBIDDEN
        {
            return Err("Claude sign-in is required".to_string());
        }
        if !response.status().is_success() {
            return Err("Claude quota is temporarily unavailable".to_string());
        }
        let body: Value = response
            .json()
            .await
            .map_err(|_| "Claude quota response format changed".to_string())?;
        let short_window = window(body.get("five_hour"), 18_000)
            .ok_or_else(|| "Claude quota response is missing the 5-hour window".to_string())?;
        Ok(ProviderSnapshot {
            provider: "claude".into(),
            display_name: "CLAUDE".into(),
            plan,
            short_window: Some(short_window),
            weekly_window: window(body.get("seven_day"), 604_800),
            reset_credits: None,
            reset_credit_expires_at: Vec::new(),
            updated_at: Utc::now().to_rfc3339(),
            status: "ok".into(),
            message: None,
            month_cost: None,
            day_cost: None,
        })
    }
    .await;
    result.unwrap_or_else(|message| ProviderSnapshot {
        provider: "claude".into(),
        display_name: "CLAUDE".into(),
        ..ProviderSnapshot::failure(
            if is_sign_in_issue(&message) {
                "signed_out"
            } else {
                "unavailable"
            },
            &message,
        )
    })
}

fn is_sign_in_issue(message: &str) -> bool {
    let value = message.to_ascii_lowercase();
    value.contains("sign-in") || value.contains("credentials") || value.contains("login")
}

#[cfg(test)]
mod tests {
    use super::is_sign_in_issue;

    #[test]
    fn classifies_missing_or_expired_claude_credentials_as_sign_in_required() {
        assert!(is_sign_in_issue("Claude Code credentials were not found"));
        assert!(is_sign_in_issue("Claude Code sign-in is required"));
        assert!(!is_sign_in_issue("Claude quota response format changed"));
    }
}
