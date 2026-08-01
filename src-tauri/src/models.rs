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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workbuddy: Option<WorkBuddyPoints>,
    pub updated_at: String,
    pub status: String,
    pub message: Option<String>,
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
            workbuddy: None,
            updated_at: chrono::Utc::now().to_rfc3339(),
            status: status.into(),
            message: Some(message.into()),
        }
    }
    pub fn failure_for(provider: &str, display_name: &str, status: &str, message: &str) -> Self {
        Self {
            provider: provider.into(),
            display_name: display_name.into(),
            plan: None,
            short_window: None,
            weekly_window: None,
            reset_credits: None,
            reset_credit_expires_at: Vec::new(),
            workbuddy: None,
            updated_at: chrono::Utc::now().to_rfc3339(),
            status: status.into(),
            message: Some(message.into()),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkBuddyPoints {
    pub monthly_remaining: f64,
    pub monthly_total: f64,
    pub addon_remaining: f64,
    pub addon_total: f64,
    pub expiring_addon_remaining: Option<f64>,
    pub expiring_addon_expires_at: Option<String>,
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
    #[serde(default = "default_enabled_providers")]
    pub enabled_providers: Vec<String>,
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
}

fn default_always_on_top() -> bool {
    true
}
fn default_enabled_providers() -> Vec<String> {
    vec!["codex".into(), "workbuddy".into()]
}
fn default_language() -> String {
    "zh-CN".into()
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
            enabled_providers: default_enabled_providers(),
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
        }
    }
}

impl WidgetPreferences {
    pub fn normalized(mut self) -> Self {
        self.auto_rotate_seconds = self.auto_rotate_seconds.clamp(5, 300);
        if !matches!(self.pinned_provider.as_deref(), Some("codex" | "workbuddy")) {
            self.pinned_provider = None;
        }
        self.enabled_providers.retain(|provider| matches!(provider.as_str(), "codex" | "workbuddy"));
        self.enabled_providers.sort();
        self.enabled_providers.dedup();
        if self.enabled_providers.is_empty() {
            self.enabled_providers = default_enabled_providers();
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
        self.unlocked_skins.retain(|skin| matches!(skin.as_str(), "blur" | "computer"));
        self.unlocked_skins.sort();
        self.unlocked_skins.dedup();
        if !matches!(self.selected_skin.as_str(), "default" | "blur" | "computer") {
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
    use super::WidgetPreferences;

    #[test]
    fn retains_workbuddy_as_the_selected_display() {
        let preferences = WidgetPreferences {
            pinned_provider: Some("workbuddy".into()),
            ..WidgetPreferences::default()
        }
        .normalized();
        assert_eq!(preferences.pinned_provider.as_deref(), Some("workbuddy"));
    }

    #[test]
    fn enabled_providers_defaults_to_all_known_services() {
        let preferences = WidgetPreferences::default().normalized();
        assert_eq!(preferences.enabled_providers, vec!["codex", "workbuddy"]);
    }

    #[test]
    fn enabled_providers_filters_unknown_entries_and_keeps_at_least_one() {
        let preferences = WidgetPreferences {
            enabled_providers: vec!["codex".into(), "unknown".into(), "workbuddy".into(), "codex".into()],
            ..WidgetPreferences::default()
        }
        .normalized();
        assert_eq!(preferences.enabled_providers, vec!["codex", "workbuddy"]);

        let only_unknown = WidgetPreferences {
            enabled_providers: vec!["unknown".into()],
            ..WidgetPreferences::default()
        }
        .normalized();
        assert_eq!(only_unknown.enabled_providers, vec!["codex", "workbuddy"]);

        let single = WidgetPreferences {
            enabled_providers: vec!["workbuddy".into()],
            ..WidgetPreferences::default()
        }
        .normalized();
        assert_eq!(single.enabled_providers, vec!["workbuddy"]);
    }
}
