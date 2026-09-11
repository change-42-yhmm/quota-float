use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    pub remaining_percent: f64,
    pub resets_at: Option<String>,
    pub window_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSnapshot {
    pub provider: String,
    pub display_name: String,
    pub plan: Option<String>,
    pub short_window: Option<UsageWindow>,
    pub weekly_window: Option<UsageWindow>,
    pub reset_credits: Option<u64>,
    pub reset_credit_expires_at: Vec<String>,
    pub updated_at: String,
    pub status: String,
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub month_cost: Option<Money>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub day_cost: Option<Money>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Money {
    pub amount: f64,
    pub currency: String,
}

impl ProviderSnapshot {
    pub fn failure(status: &str, message: &str) -> Self {
        Self {
            provider: "codex".into(),
            display_name: "CODEX".into(),
            plan: None,
            short_window: None,
            weekly_window: None,
            reset_credits: None,
            reset_credit_expires_at: Vec::new(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            status: status.into(),
            message: Some(message.into()),
            month_cost: None,
            day_cost: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetPreferences {
    pub locked: bool,
    #[serde(default = "default_always_on_top")]
    pub always_on_top: bool,
    #[serde(default)]
    pub stay_expanded: bool,
    pub pinned_provider: Option<String>,
    pub auto_rotate_seconds: u64,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_appearance")]
    pub appearance: String,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub licenses: Vec<String>,
    #[serde(default)]
    pub unlocked_skin: Option<String>,
    #[serde(default)]
    pub unlocked_skins: Vec<String>,
    #[serde(default = "default_skin")]
    pub selected_skin: String,
    #[serde(default)]
    pub supporter_prompt_first_seen_at: Option<String>,
    #[serde(default)]
    pub supporter_prompt_shown_at: Option<String>,
    #[serde(default)]
    pub supporter_prompt_revision: u8,
    #[serde(default)]
    pub supporter_prompt_version: String,
    #[serde(default)]
    pub supporter_prompt_launch_count: u8,
}

fn default_always_on_top() -> bool {
    true
}
fn default_language() -> String {
    platform_default_language().into()
}

fn language_from_locale(locale: &str) -> &'static str {
    if locale.trim().to_ascii_lowercase().starts_with("zh") {
        "zh-CN"
    } else {
        "en"
    }
}

#[cfg(target_os = "windows")]
fn platform_default_language() -> &'static str {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let user = RegKey::predef(HKEY_CURRENT_USER);
    user.open_subkey(r"Control Panel\International")
        .ok()
        .and_then(|key| key.get_value::<String, _>("LocaleName").ok())
        .map(|locale| language_from_locale(&locale))
        .unwrap_or("en")
}

#[cfg(not(target_os = "windows"))]
fn platform_default_language() -> &'static str {
    std::env::var("LANG")
        .ok()
        .map(|locale| language_from_locale(&locale))
        .unwrap_or("en")
}
fn default_appearance() -> String {
    "light".into()
}
fn default_skin() -> String {
    "default".into()
}

impl Default for WidgetPreferences {
    fn default() -> Self {
        Self {
            locked: false,
            always_on_top: true,
            stay_expanded: false,
            pinned_provider: None,
            auto_rotate_seconds: 12,
            language: default_language(),
            appearance: default_appearance(),
            license: None,
            licenses: Vec::new(),
            unlocked_skin: None,
            unlocked_skins: Vec::new(),
            selected_skin: default_skin(),
            supporter_prompt_first_seen_at: None,
            supporter_prompt_shown_at: None,
            supporter_prompt_revision: 0,
            supporter_prompt_version: String::new(),
            supporter_prompt_launch_count: 0,
        }
    }
}

impl WidgetPreferences {
    pub fn normalized(mut self) -> Self {
        self.auto_rotate_seconds = self.auto_rotate_seconds.clamp(5, 300);
        if !matches!(self.pinned_provider.as_deref(), Some("codex" | "claude")) {
            self.pinned_provider = None;
        }
        if self.language != "en" && self.language != "zh-CN" {
            self.language = default_language();
        }
        if self.appearance != "system" && self.appearance != "light" && self.appearance != "dark" {
            self.appearance = default_appearance();
        }
        if self.licenses.is_empty() {
            if let Some(legacy) = self.license.take() {
                self.licenses.push(legacy);
            }
        }
        self.licenses.retain(|license| !license.trim().is_empty());
        self.licenses.sort();
        self.licenses.dedup();
        if self.unlocked_skins.is_empty() {
            if let Some(legacy) = self.unlocked_skin.take() {
                self.unlocked_skins.push(legacy);
            }
        }
        self.unlocked_skins.retain(|skin| matches!(skin.as_str(), "blur" | "computer" | "glass" | "nexus"));
        self.unlocked_skins.sort();
        self.unlocked_skins.dedup();
        if !matches!(self.selected_skin.as_str(), "default" | "blur" | "computer" | "glass" | "nexus") {
            self.selected_skin = default_skin();
        }
        if self.selected_skin != "default" && !self.unlocked_skins.iter().any(|skin| skin == &self.selected_skin) {
            self.selected_skin = default_skin();
        }
        // Keep the legacy fields populated for pre-migration renderer payloads.
        self.license = self.licenses.first().cloned();
        self.unlocked_skin = self.unlocked_skins.first().cloned();
        self
    }
}

#[cfg(test)]
mod tests {
    use super::{language_from_locale, WidgetPreferences};

    #[test]
    fn defaults_to_chinese_only_for_chinese_system_locales() {
        assert_eq!(language_from_locale("zh-CN"), "zh-CN");
        assert_eq!(language_from_locale("ZH-hant-TW"), "zh-CN");
        assert_eq!(language_from_locale("en-US"), "en");
        assert_eq!(language_from_locale("ja-JP"), "en");
    }

    #[test]
    fn legacy_license_payload_migrates_without_loss() {
        let preferences = WidgetPreferences {
            license: Some("signed-license-json".into()),
            unlocked_skin: Some("blur".into()),
            selected_skin: "blur".into(),
            ..WidgetPreferences::default()
        }
        .normalized();
        assert_eq!(preferences.licenses, vec!["signed-license-json"]);
        assert_eq!(preferences.license.as_deref(), Some("signed-license-json"));
    }
}
