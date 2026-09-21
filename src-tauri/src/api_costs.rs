use chrono::{Datelike, TimeZone, Utc};
use reqwest::Client;
use serde_json::Value;

use crate::models::{Money, ProviderSnapshot};

fn money(value: &Value) -> Option<Money> {
    let amount = value.get("amount").unwrap_or(value);
    Some(Money {
        amount: amount.get("value")?.as_f64()?,
        currency: amount.get("currency")?.as_str()?.to_ascii_uppercase(),
    })
}

fn sum_amounts(values: impl Iterator<Item = Money>) -> Result<Money, String> {
    let mut total: Option<Money> = None;
    for item in values {
        if let Some(current) = &mut total {
            if current.currency != item.currency {
                return Err("cost report returned more than one currency".into());
            }
            current.amount += item.amount;
        } else {
            total = Some(item);
        }
    }
    Ok(total.unwrap_or(Money {
        amount: 0.0,
        currency: "USD".into(),
    }))
}

fn openai_amounts(body: &Value) -> Result<Money, String> {
    sum_amounts(
        body.get("data")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .flat_map(|bucket| {
                bucket
                    .get("results")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
            })
            .filter_map(|result| result.get("amount").and_then(money)),
    )
}

fn anthropic_amounts(body: &Value) -> Result<Money, String> {
    sum_amounts(
        body.get("data")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .flat_map(|bucket| {
                bucket
                    .get("results")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
            })
            .filter_map(|result| result.get("amount").and_then(money)),
    )
}

fn dates() -> (
    chrono::DateTime<Utc>,
    chrono::DateTime<Utc>,
    chrono::DateTime<Utc>,
) {
    let now = Utc::now();
    let day = Utc
        .with_ymd_and_hms(now.year(), now.month(), now.day(), 0, 0, 0)
        .single()
        .unwrap();
    let month = Utc
        .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
        .single()
        .unwrap();
    (month, day, now)
}

fn snapshot(
    provider: &str,
    display_name: &str,
    month_cost: Money,
    day_cost: Money,
) -> ProviderSnapshot {
    ProviderSnapshot {
        provider: provider.into(),
        display_name: display_name.into(),
        plan: None,
        short_window: None,
        weekly_window: None,
        reset_credits: None,
        reset_credit_expires_at: Vec::new(),
        updated_at: Utc::now().to_rfc3339(),
        status: "ok".into(),
        message: None,
        month_cost: Some(month_cost),
        day_cost: Some(day_cost),
    }
}

pub async fn fetch_openai(client: &Client, key: &str) -> Result<ProviderSnapshot, String> {
    let (month, day, now) = dates();
    let request = |start: chrono::DateTime<Utc>, limit: u32| {
        client
            .get("https://api.openai.com/v1/organization/costs")
            .query(&[
                ("start_time", start.timestamp().to_string()),
                ("end_time", now.timestamp().to_string()),
                ("bucket_width", "1d".into()),
                ("limit", limit.to_string()),
            ])
            .bearer_auth(key)
            .send()
    };
    let month_response = request(month, 31)
        .await
        .map_err(|_| "OpenAI cost request failed".to_string())?;
    if !month_response.status().is_success() {
        return Err("OpenAI API cost access was denied".into());
    }
    let month_body: Value = month_response
        .json()
        .await
        .map_err(|_| "OpenAI cost response format changed".to_string())?;
    let day_response = request(day, 1)
        .await
        .map_err(|_| "OpenAI cost request failed".to_string())?;
    if !day_response.status().is_success() {
        return Err("OpenAI API cost access was denied".into());
    }
    let day_body: Value = day_response
        .json()
        .await
        .map_err(|_| "OpenAI cost response format changed".to_string())?;
    Ok(snapshot(
        "openai_api",
        "OPENAI API",
        openai_amounts(&month_body)?,
        openai_amounts(&day_body)?,
    ))
}

pub async fn fetch_claude(client: &Client, key: &str) -> Result<ProviderSnapshot, String> {
    let (month, day, now) = dates();
    let request = |start: chrono::DateTime<Utc>| {
        client
            .get("https://api.anthropic.com/v1/organizations/cost_report")
            .query(&[
                ("starting_at", start.to_rfc3339()),
                ("ending_at", now.to_rfc3339()),
                ("limit", "31".into()),
            ])
            .header("anthropic-version", "2023-06-01")
            .header("x-api-key", key)
            .send()
    };
    let month_response = request(month)
        .await
        .map_err(|_| "Claude API cost request failed".to_string())?;
    if !month_response.status().is_success() {
        return Err("Claude API cost access was denied".into());
    }
    let month_body: Value = month_response
        .json()
        .await
        .map_err(|_| "Claude API cost response format changed".to_string())?;
    let day_response = request(day)
        .await
        .map_err(|_| "Claude API cost request failed".to_string())?;
    if !day_response.status().is_success() {
        return Err("Claude API cost access was denied".into());
    }
    let day_body: Value = day_response
        .json()
        .await
        .map_err(|_| "Claude API cost response format changed".to_string())?;
    Ok(snapshot(
        "claude_api",
        "CLAUDE API",
        anthropic_amounts(&month_body)?,
        anthropic_amounts(&day_body)?,
    ))
}
