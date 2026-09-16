mod api_costs;
mod claude;
mod codex;
mod credentials;
mod license;
mod models;
mod native_material;

use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::{Mutex, MutexGuard},
    time::{Duration, Instant},
};

use license::{device_request_code, parse_and_verify, SupporterStatus, BLUR_SKIN_ID, COMPUTER_SKIN_ID, GLASS_SKIN_ID, NEXUS_SKIN_ID};
use models::{ProviderSnapshot, WidgetPreferences};
#[cfg(debug_assertions)]
use models::UsageWindow;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Listener, Manager, PhysicalPosition, PhysicalSize, State, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_window_state::Builder as WindowStateBuilder;

// These are the light-theme visual dimensions. They deliberately do not vary
// by appearance: a theme changes colours only, while the native window keeps
// the same footprint as its CSS content.
const COLLAPSED_LOGICAL_SIZE: f64 = 72.0;
const EXPANDED_LOGICAL_SIZE: f64 = 306.0;
const EDGE_SAFE_INSET_LOGICAL: f64 = 4.0;
const SNAP_THRESHOLD_LOGICAL: f64 = 24.0;
const POSITION_EPSILON: u32 = 2;

#[derive(Clone, Copy)]
enum HorizontalDock {
    Left,
    Right,
}

#[derive(Clone, Copy)]
enum VerticalDock {
    Top,
    Bottom,
}

#[derive(Clone, Copy, Default)]
struct DockState {
    horizontal: Option<HorizontalDock>,
    vertical: Option<VerticalDock>,
}

impl DockState {
    fn is_docked(self) -> bool {
        self.horizontal.is_some() || self.vertical.is_some()
    }
}

#[derive(Clone, Copy)]
struct WidgetRect {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
}

#[derive(Clone, Copy, Deserialize)]
struct WorkAreaPoint {
    x: i32,
    y: i32,
}

#[derive(Clone, Copy, Deserialize)]
struct WorkAreaSize {
    width: u32,
    height: u32,
}

#[derive(Clone, Copy, Deserialize)]
struct WorkAreaPayload {
    position: WorkAreaPoint,
    size: WorkAreaSize,
}

#[derive(Clone, Copy)]
enum WidgetMode {
    Collapsed,
    Expanded,
}

#[derive(Clone, Copy)]
struct WidgetGeometryState {
    mode: WidgetMode,
    dock: DockState,
    collapsed_rect: WidgetRect,
    expanded_rect: Option<WidgetRect>,
    user_moved_expanded: bool,
}

struct AppState {
    client: reqwest::Client,
    preferences: Mutex<WidgetPreferences>,
    preferences_path: PathBuf,
    fetch_lock: tokio::sync::Mutex<()>,
    snapshot_cache: Mutex<Option<(Instant, Vec<ProviderSnapshot>)>>,
    #[cfg(debug_assertions)]
    simulate_short_window_for_testing: Mutex<bool>,
    geometry: Mutex<Option<WidgetGeometryState>>,
    drag_mode: Mutex<Option<WidgetMode>>,
    update_available: Mutex<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceStatus {
    id: String,
    connected: bool,
    detected: bool,
    connected_at: Option<String>,
}

fn update_menu_label(language: &str, update_available: bool) -> &'static str {
    match (language == "en", update_available) {
        (true, true) => "🟢 Check for updates",
        (false, true) => "🟢 检查更新",
        (true, false) => "Check for updates",
        (false, false) => "检查更新",
    }
}

fn apply_short_window_test_override(
    _state: &AppState,
    #[allow(unused_mut)]
    mut snapshots: Vec<ProviderSnapshot>,
) -> Vec<ProviderSnapshot> {
    #[cfg(debug_assertions)]
    if _state
        .simulate_short_window_for_testing
        .lock()
        .map(|value| *value)
        .unwrap_or(false)
    {
        for snapshot in &mut snapshots {
            if snapshot.status == "ok" {
                snapshot.short_window = Some(UsageWindow {
                    remaining_percent: 88.0,
                    resets_at: Some((chrono::Utc::now() + chrono::Duration::hours(3)).to_rfc3339()),
                    window_seconds: 18_000,
                });
            }
        }
    }
    snapshots
}

async fn fetch_connected_snapshots(state: &AppState) -> Vec<ProviderSnapshot> {
    let preferences = preferences_lock(state).clone();
    let mut values = vec![codex::fetch_snapshot(&state.client).await];
    if preferences.claude_subscription_connected_at.is_some() {
        values.push(claude::fetch_snapshot(&state.client).await);
    }
    if preferences.openai_api_connected_at.is_some() {
        let snapshot = match credentials::load("openai_api") {
            Ok(key) => api_costs::fetch_openai(&state.client, &key).await,
            Err(message) => Err(message),
        }.unwrap_or_else(|message| ProviderSnapshot { provider: "openai_api".into(), display_name: "OPENAI API".into(), ..ProviderSnapshot::failure("unavailable", &message) });
        values.push(snapshot);
    }
    if preferences.claude_api_connected_at.is_some() {
        let snapshot = match credentials::load("claude_api") {
            Ok(key) => api_costs::fetch_claude(&state.client, &key).await,
            Err(message) => Err(message),
        }.unwrap_or_else(|message| ProviderSnapshot { provider: "claude_api".into(), display_name: "CLAUDE API".into(), ..ProviderSnapshot::failure("unavailable", &message) });
        values.push(snapshot);
    }
    values
}

async fn fetch_snapshots_uncached(state: &State<'_, AppState>) -> Vec<ProviderSnapshot> {
    let _guard = state.fetch_lock.lock().await;
    let values = fetch_connected_snapshots(state.inner()).await;
    if let Ok(mut cache) = state.snapshot_cache.lock() {
        *cache = Some((Instant::now(), values.clone()));
    }
    apply_short_window_test_override(state.inner(), values)
}

#[cfg(target_os = "macos")]
fn sync_macos_menu_bar_metric(app: &AppHandle, state: &AppState, snapshots: &[ProviderSnapshot]) {
    let preferences = preferences_lock(state).clone();
    if !preferences.show_tray_metric {
        if let Some(tray) = app.tray_by_id("main") {
            // tray-icon on macOS ignores None; an empty title clears existing text.
            let _ = tray.set_title(Some(""));
            if let Some(icon) = app.default_window_icon() {
                let _ = tray.set_icon(Some(icon.clone()));
            }
        }
        return;
    }
    let pinned = preferences.pinned_provider;
    let current = pinned
        .as_deref()
        .and_then(|provider| snapshots.iter().find(|item| item.provider == provider))
        .or_else(|| snapshots.first());
    let title = current.map(|snapshot| {
        if snapshot.status != "ok" {
            return match (preferences.language.as_str(), snapshot.status.as_str()) {
                ("en", "signed_out") => "Sign in required".into(),
                ("en", "stale") => "Data expired".into(),
                ("en", _) => "Unavailable".into(),
                (_, "signed_out") => "需要登录".into(),
                (_, "stale") => "数据过期".into(),
                _ => "无法读取".into(),
            };
        }
        if let Some(cost) = &snapshot.day_cost {
            let label = if preferences.language == "en" { "API" } else { "今日API" };
            return format!("{} {}", label, format_tray_api_amount(cost.amount));
        }
        if let Some(window) = &snapshot.short_window {
            let label = if preferences.language == "en" { "5h" } else { "5小时剩余" };
            return format!("{} {:.0}%", label, window.remaining_percent);
        }
        if let Some(window) = &snapshot.weekly_window {
            let label = if preferences.language == "en" { "Week" } else { "周剩余" };
            return format!("{} {:.0}%", label, window.remaining_percent);
        }
        if preferences.language == "en" { "Unavailable".into() } else { "无法读取".into() }
    });
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_icon(None);
        let _ = tray.set_title(title);
    }
}

#[cfg(not(target_os = "macos"))]
fn sync_macos_menu_bar_metric(_app: &AppHandle, _state: &AppState, _snapshots: &[ProviderSnapshot]) {}

fn format_tray_api_amount(amount: f64) -> String {
    let amount = amount.max(0.0);
    if amount >= 999.5 {
        return "999+".into();
    }
    for decimals in [2, 1, 0] {
        let text = format!("{amount:.decimals$}");
        if text.chars().filter(|character| character.is_ascii_digit()).count() <= 4 {
            return text;
        }
    }
    "999+".into()
}

#[cfg(target_os = "windows")]
fn windows_tray_text(snapshot: Option<&ProviderSnapshot>) -> String {
    let Some(snapshot) = snapshot else { return "--".into() };
    if snapshot.status != "ok" {
        return "--".into();
    }
    if let Some(cost) = &snapshot.day_cost {
        return format_tray_api_amount(cost.amount);
    }
    snapshot
        .short_window
        .as_ref()
        .or(snapshot.weekly_window.as_ref())
        .map(|window| format!("{:.0}", window.remaining_percent.clamp(0.0, 100.0)))
        .unwrap_or_else(|| "--".into())
}

#[cfg(target_os = "windows")]
fn windows_tray_image(text: &str) -> tauri::image::Image<'static> {
    const SIZE: usize = 32;
    const GLYPHS: [(&str, [&str; 5]); 13] = [
        ("0", ["111", "101", "101", "101", "111"]), ("1", ["010", "110", "010", "010", "111"]),
        ("2", ["111", "001", "111", "100", "111"]), ("3", ["111", "001", "111", "001", "111"]),
        ("4", ["101", "101", "111", "001", "001"]), ("5", ["111", "100", "111", "001", "111"]),
        ("6", ["111", "100", "111", "101", "111"]), ("7", ["111", "001", "010", "010", "010"]),
        ("8", ["111", "101", "111", "101", "111"]), ("9", ["111", "101", "111", "001", "111"]),
        ("-", ["000", "000", "111", "000", "000"]), (".", ["000", "000", "000", "000", "010"]),
        ("+", ["000", "010", "111", "010", "000"]),
    ];
    let scale = if text.len() <= 2 { 4 } else if text.len() <= 4 { 2 } else { 1 };
    let advance = 4 * scale;
    let start_x = (SIZE.saturating_sub(text.len() * advance - scale)) / 2;
    let start_y = (SIZE - 5 * scale) / 2;
    let mut rgba = vec![0_u8; SIZE * SIZE * 4];
    for y in 1..(SIZE - 1) {
        for x in 1..(SIZE - 1) {
            let index = (y * SIZE + x) * 4;
            rgba[index..index + 4].copy_from_slice(&[0, 152, 198, 255]);
        }
    }
    for (offset, character) in text.chars().enumerate() {
        let Some((_, rows)) = GLYPHS.iter().find(|(symbol, _)| *symbol == character.to_string()) else { continue };
        for (row, pattern) in rows.iter().enumerate() {
            for (column, pixel) in pattern.chars().enumerate() {
                if pixel == '1' {
                    for dy in 0..scale { for dx in 0..scale {
                        let x = start_x + offset * advance + column * scale + dx;
                        let y = start_y + row * scale + dy;
                        if x < SIZE && y < SIZE {
                            let index = (y * SIZE + x) * 4;
                            rgba[index..index + 4].copy_from_slice(&[255, 255, 255, 255]);
                        }
                    }}
                }
            }
        }
    }
    tauri::image::Image::new_owned(rgba, SIZE as u32, SIZE as u32)
}

#[cfg(target_os = "windows")]
fn sync_windows_tray_metric(app: &AppHandle, state: &AppState, snapshots: &[ProviderSnapshot]) {
    let preferences = preferences_lock(state).clone();
    if !preferences.show_tray_metric {
        if let Some(tray) = app.tray_by_id("main") {
            if let Some(icon) = app.default_window_icon() {
                let _ = tray.set_icon(Some(icon.clone()));
            }
            let _ = tray.set_tooltip(Some("Quota Float"));
        }
        return;
    }
    let current = preferences.pinned_provider.as_deref().and_then(|provider| snapshots.iter().find(|item| item.provider == provider)).or_else(|| snapshots.first());
    let text = windows_tray_text(current);
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_icon(Some(windows_tray_image(&text)));
        let _ = tray.set_tooltip(Some(format!("Quota Float · {text}")));
    }
}

#[cfg(not(target_os = "windows"))]
fn sync_windows_tray_metric(_app: &AppHandle, _state: &AppState, _snapshots: &[ProviderSnapshot]) {}

fn sync_tray_metric(app: &AppHandle, state: &AppState, snapshots: &[ProviderSnapshot]) {
    sync_macos_menu_bar_metric(app, state, snapshots);
    sync_windows_tray_metric(app, state, snapshots);
}

fn load_preferences(path: &PathBuf) -> WidgetPreferences {
    let parse = |candidate: &PathBuf| {
        fs::read_to_string(candidate)
            .ok()
            .and_then(|raw| serde_json::from_str::<WidgetPreferences>(&raw).ok())
    };
    if let Some(value) = parse(path) {
        return value.normalized();
    }
    let backup = path.with_extension("json.bak");
    if let Some(value) = parse(&backup) {
        eprintln!("preferences recovered from backup");
        return value.normalized();
    }
    WidgetPreferences::default()
}

fn preferences_lock(state: &AppState) -> MutexGuard<'_, WidgetPreferences> {
    state.preferences.lock().unwrap_or_else(|poisoned| {
        eprintln!("preferences lock was poisoned; recovering the last in-memory settings");
        poisoned.into_inner()
    })
}

fn persist_preferences(path: &PathBuf, value: &WidgetPreferences) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|_| "failed to create settings directory".to_string())?;
    }
    let serialized =
        serde_json::to_vec_pretty(value).map_err(|_| "failed to serialize settings".to_string())?;
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    let mut file = fs::File::create(&temporary)
        .map_err(|_| "failed to create temporary settings file".to_string())?;
    file.write_all(&serialized)
        .and_then(|_| file.sync_all())
        .map_err(|_| "failed to write settings".to_string())?;
    if path.exists() {
        let _ = fs::remove_file(&backup);
        fs::rename(path, &backup).map_err(|_| "failed to back up settings".to_string())?;
    }
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::rename(&backup, path);
        return Err(format!("failed to commit settings: {error}"));
    }
    Ok(())
}

const SUPPORTER_PROMPT_LAUNCHES: u8 = 2;

fn should_show_supporter_prompt(
    preferences: &mut WidgetPreferences,
    now: DateTime<Utc>,
    version: &str,
) -> bool {
    if preferences.supporter_prompt_version != version {
        preferences.supporter_prompt_version = version.to_string();
        preferences.supporter_prompt_launch_count = 0;
    }
    if preferences.supporter_prompt_launch_count >= SUPPORTER_PROMPT_LAUNCHES {
        return false;
    }
    if preferences.supporter_prompt_first_seen_at.is_none() {
        preferences.supporter_prompt_first_seen_at = Some(now.to_rfc3339());
    }
    preferences.supporter_prompt_shown_at = Some(now.to_rfc3339());
    preferences.supporter_prompt_launch_count += 1;
    true
}

#[tauri::command]
async fn get_snapshots(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<ProviderSnapshot>, String> {
    const CACHE_TTL: Duration = Duration::from_secs(30);
    if let Ok(cache) = state.snapshot_cache.lock() {
        if let Some((time, values)) = &*cache {
            if time.elapsed() < CACHE_TTL {
                let values = apply_short_window_test_override(&state, values.clone());
                sync_tray_metric(&app, state.inner(), &values);
                return Ok(values);
            }
        }
    }
    let _guard = match state.fetch_lock.try_lock() {
        Ok(guard) => guard,
        Err(_) => {
            if let Ok(cache) = state.snapshot_cache.lock() {
                if let Some((_, values)) = &*cache {
                    let values = apply_short_window_test_override(&state, values.clone());
                    sync_tray_metric(&app, state.inner(), &values);
                    return Ok(values);
                }
            }
            let values = vec![ProviderSnapshot::failure(
                "unavailable",
                "Quota refresh is already running.",
            )];
            sync_tray_metric(&app, state.inner(), &values);
            return Ok(values);
        }
    };
    if let Ok(cache) = state.snapshot_cache.lock() {
        if let Some((time, values)) = &*cache {
            if time.elapsed() < CACHE_TTL {
                let values = apply_short_window_test_override(&state, values.clone());
                sync_tray_metric(&app, state.inner(), &values);
                return Ok(values);
            }
        }
    }
    let values = fetch_connected_snapshots(state.inner()).await;
    if let Ok(mut cache) = state.snapshot_cache.lock() {
        *cache = Some((Instant::now(), values.clone()));
    }
    let values = apply_short_window_test_override(&state, values);
    sync_tray_metric(&app, state.inner(), &values);
    Ok(values)
}

#[tauri::command]
async fn refresh_snapshots(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<ProviderSnapshot>, String> {
    let values = fetch_snapshots_uncached(&state).await;
    sync_tray_metric(&app, state.inner(), &values);
    Ok(values)
}

fn source_statuses(preferences: &WidgetPreferences) -> Vec<SourceStatus> {
    vec![
        SourceStatus { id: "codex".into(), connected: true, detected: true, connected_at: None },
        SourceStatus { id: "claude".into(), connected: preferences.claude_subscription_connected_at.is_some(), detected: claude::is_detected(), connected_at: preferences.claude_subscription_connected_at.clone() },
        SourceStatus { id: "openai_api".into(), connected: preferences.openai_api_connected_at.is_some(), detected: false, connected_at: preferences.openai_api_connected_at.clone() },
        SourceStatus { id: "claude_api".into(), connected: preferences.claude_api_connected_at.is_some(), detected: false, connected_at: preferences.claude_api_connected_at.clone() },
    ]
}

#[tauri::command]
fn get_source_statuses(state: State<'_, AppState>) -> Vec<SourceStatus> {
    source_statuses(&preferences_lock(state.inner()))
}

#[tauri::command]
async fn connect_claude_subscription(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<SourceStatus>, String> {
    if !claude::is_detected() { return Err("Claude Code credentials were not found".into()); }
    let validation = claude::fetch_snapshot(&state.client).await;
    if validation.status != "ok" { return Err(validation.message.unwrap_or_else(|| "Claude subscription could not be connected".into())); }
    let mut preferences = preferences_lock(state.inner());
    if preferences.claude_subscription_connected_at.is_none() { preferences.claude_subscription_connected_at = Some(Utc::now().to_rfc3339()); }
    let saved = preferences.clone().normalized();
    *preferences = saved.clone();
    persist_preferences(&state.preferences_path, &saved)?;
    drop(preferences);
    let _ = app.emit_to("widget", "refresh-requested", ());
    Ok(source_statuses(&saved))
}

#[tauri::command]
async fn connect_api_cost_source(app: AppHandle, state: State<'_, AppState>, source: String, credential: String) -> Result<Vec<SourceStatus>, String> {
    let source = source.trim();
    let validation = match source {
        "openai_api" => api_costs::fetch_openai(&state.client, credential.trim()).await,
        "claude_api" => api_costs::fetch_claude(&state.client, credential.trim()).await,
        _ => return Err("unknown API cost source".into()),
    }?;
    if validation.status != "ok" { return Err("API cost source could not be connected".into()); }
    credentials::save(source, credential.trim())?;
    let mut preferences = preferences_lock(state.inner());
    let connected_at = Some(Utc::now().to_rfc3339());
    match source { "openai_api" => preferences.openai_api_connected_at = connected_at, "claude_api" => preferences.claude_api_connected_at = connected_at, _ => unreachable!() }
    let saved = preferences.clone().normalized();
    *preferences = saved.clone();
    persist_preferences(&state.preferences_path, &saved)?;
    drop(preferences);
    let _ = app.emit_to("widget", "refresh-requested", ());
    Ok(source_statuses(&saved))
}

#[tauri::command]
fn disconnect_source(app: AppHandle, state: State<'_, AppState>, source: String) -> Result<Vec<SourceStatus>, String> {
    let source = source.trim();
    if !matches!(source, "claude" | "openai_api" | "claude_api") { return Err("unknown source".into()); }
    if source != "claude" { credentials::delete(source)?; }
    let mut preferences = preferences_lock(state.inner());
    match source { "claude" => preferences.claude_subscription_connected_at = None, "openai_api" => preferences.openai_api_connected_at = None, "claude_api" => preferences.claude_api_connected_at = None, _ => unreachable!() }
    if preferences.pinned_provider.as_deref() == Some(source) { preferences.pinned_provider = None; }
    let saved = preferences.clone().normalized();
    *preferences = saved.clone();
    persist_preferences(&state.preferences_path, &saved)?;
    drop(preferences);
    if let Ok(mut cache) = state.snapshot_cache.lock() { *cache = None; }
    let _ = app.emit_to("widget", "refresh-requested", ());
    Ok(source_statuses(&saved))
}

fn clamp_position_to_monitor(
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    monitor: &tauri::Monitor,
    safe_inset: i32,
) -> PhysicalPosition<i32> {
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let left = monitor_position.x;
    let top = monitor_position.y;
    let right = left + monitor_size.width as i32;
    let bottom = top + monitor_size.height as i32;
    PhysicalPosition::new(
        position
            .x
            .clamp(left - safe_inset, right - size.width as i32 + safe_inset),
        position
            .y
            .clamp(top - safe_inset, bottom - size.height as i32 + safe_inset),
    )
}

fn logical_to_physical(value: f64, scale_factor: f64) -> u32 {
    (value * scale_factor).round().max(1.0) as u32
}

fn safe_inset_for_current_appearance(state: &AppState, scale_factor: f64) -> u32 {
    let skin = preferences_lock(state).selected_skin.clone();
    logical_to_physical(shadow_inset_for_skin(&skin), scale_factor)
}

fn shadow_inset_for_skin(skin: &str) -> f64 {
    if cfg!(any(target_os = "windows", target_os = "macos")) && skin == GLASS_SKIN_ID { 32.0 } else { EDGE_SAFE_INSET_LOGICAL }
}

fn window_size_for_visual_size(visual_size: u32, safe_inset: u32) -> u32 {
    visual_size + safe_inset * 2
}

fn widget_window_size(logical_visual_size: f64, scale_factor: f64, safe_inset: u32) -> u32 {
    window_size_for_visual_size(
        logical_to_physical(logical_visual_size, scale_factor),
        safe_inset,
    )
}

fn detect_dock(
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    monitor: &tauri::Monitor,
    threshold: i32,
    safe_inset: i32,
) -> DockState {
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let visible_left = position.x + safe_inset;
    let visible_top = position.y + safe_inset;
    let visible_right = position.x + size.width as i32 - safe_inset;
    let visible_bottom = position.y + size.height as i32 - safe_inset;
    let left_distance = (visible_left - monitor_position.x).abs();
    let top_distance = (visible_top - monitor_position.y).abs();
    let right_distance = (monitor_position.x + monitor_size.width as i32 - visible_right).abs();
    let bottom_distance = (monitor_position.y + monitor_size.height as i32 - visible_bottom).abs();
    let horizontal = if left_distance <= threshold || right_distance <= threshold {
        if left_distance <= right_distance {
            Some(HorizontalDock::Left)
        } else {
            Some(HorizontalDock::Right)
        }
    } else {
        None
    };
    let vertical = if top_distance <= threshold || bottom_distance <= threshold {
        if top_distance <= bottom_distance {
            Some(VerticalDock::Top)
        } else {
            Some(VerticalDock::Bottom)
        }
    } else {
        None
    };
    DockState {
        horizontal,
        vertical,
    }
}

fn snap_position(
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    dock: DockState,
    monitor: &tauri::Monitor,
    safe_inset: i32,
) -> PhysicalPosition<i32> {
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let mut next = clamp_position_to_monitor(position, size, monitor, safe_inset);
    match dock.horizontal {
        Some(HorizontalDock::Left) => next.x = monitor_position.x - safe_inset,
        Some(HorizontalDock::Right) => {
            next.x = monitor_position.x + monitor_size.width as i32 - size.width as i32 + safe_inset
        }
        None => {}
    }
    match dock.vertical {
        Some(VerticalDock::Top) => next.y = monitor_position.y - safe_inset,
        Some(VerticalDock::Bottom) => {
            next.y =
                monitor_position.y + monitor_size.height as i32 - size.height as i32 + safe_inset
        }
        None => {}
    }
    next
}

fn expanded_position_in_bounds(
    collapsed: WidgetRect,
    expanded_size: PhysicalSize<u32>,
    dock: DockState,
    bounds_position: PhysicalPosition<i32>,
    bounds_size: PhysicalSize<u32>,
    safe_inset: i32,
) -> PhysicalPosition<i32> {
    let monitor_right = bounds_position.x + bounds_size.width as i32;
    let monitor_bottom = bounds_position.y + bounds_size.height as i32;
    let collapsed_left = collapsed.position.x + safe_inset;
    let collapsed_top = collapsed.position.y + safe_inset;
    let collapsed_right = collapsed.position.x + collapsed.size.width as i32 - safe_inset;
    let collapsed_bottom = collapsed.position.y + collapsed.size.height as i32 - safe_inset;
    let x = match dock.horizontal {
        Some(HorizontalDock::Left) => collapsed_left - safe_inset,
        Some(HorizontalDock::Right) => collapsed_right - expanded_size.width as i32 + safe_inset,
        None if collapsed_left + expanded_size.width as i32 - safe_inset > monitor_right => {
            collapsed_right - expanded_size.width as i32 + safe_inset
        }
        None => collapsed_left - safe_inset,
    };
    let y = match dock.vertical {
        Some(VerticalDock::Top) => collapsed_top - safe_inset,
        Some(VerticalDock::Bottom) => collapsed_bottom - expanded_size.height as i32 + safe_inset,
        None if collapsed_top + expanded_size.height as i32 - safe_inset > monitor_bottom => {
            collapsed_bottom - expanded_size.height as i32 + safe_inset
        }
        None => collapsed_top - safe_inset,
    };
    let min_x = bounds_position.x - safe_inset;
    let min_y = bounds_position.y - safe_inset;
    let max_x = (monitor_right - expanded_size.width as i32 + safe_inset).max(min_x);
    let max_y = (monitor_bottom - expanded_size.height as i32 + safe_inset).max(min_y);
    PhysicalPosition::new(x.clamp(min_x, max_x), y.clamp(min_y, max_y))
}

fn expanded_position(
    collapsed: WidgetRect,
    expanded_size: PhysicalSize<u32>,
    dock: DockState,
    monitor: &tauri::Monitor,
    work_area: Option<WorkAreaPayload>,
    safe_inset: i32,
) -> PhysicalPosition<i32> {
    let (bounds_position, bounds_size) = work_area
        .map(|area| {
            (
                PhysicalPosition::new(area.position.x, area.position.y),
                PhysicalSize::new(area.size.width, area.size.height),
            )
        })
        .unwrap_or_else(|| (*monitor.position(), *monitor.size()));
    expanded_position_in_bounds(
        collapsed,
        expanded_size,
        dock,
        bounds_position,
        bounds_size,
        safe_inset,
    )
}

fn collapsed_geometry_for_expand(
    current_position: PhysicalPosition<i32>,
    collapsed_size: PhysicalSize<u32>,
    monitor: &tauri::Monitor,
    threshold: i32,
    safe_inset: i32,
    previous: Option<WidgetGeometryState>,
) -> (WidgetRect, DockState) {
    if let Some(previous) = previous {
        let can_reuse_anchor = matches!(previous.mode, WidgetMode::Collapsed)
            || (matches!(previous.mode, WidgetMode::Expanded) && !previous.user_moved_expanded);
        if can_reuse_anchor {
            let position = if previous.dock.is_docked() {
                snap_position(
                    previous.collapsed_rect.position,
                    collapsed_size,
                    previous.dock,
                    monitor,
                    safe_inset,
                )
            } else {
                clamp_position_to_monitor(
                    previous.collapsed_rect.position,
                    collapsed_size,
                    monitor,
                    safe_inset,
                )
            };
            return (
                WidgetRect {
                    position,
                    size: collapsed_size,
                },
                previous.dock,
            );
        }
    }

    let current_collapsed = WidgetRect {
        position: clamp_position_to_monitor(current_position, collapsed_size, monitor, safe_inset),
        size: collapsed_size,
    };
    let dock = detect_dock(
        current_collapsed.position,
        collapsed_size,
        monitor,
        threshold,
        safe_inset,
    );
    let position = if dock.is_docked() {
        snap_position(
            current_collapsed.position,
            collapsed_size,
            dock,
            monitor,
            safe_inset,
        )
    } else {
        current_collapsed.position
    };
    (
        WidgetRect {
            position,
            size: collapsed_size,
        },
        dock,
    )
}

fn current_widget_rect(window: &tauri::WebviewWindow) -> Result<WidgetRect, String> {
    Ok(WidgetRect {
        position: window
            .outer_position()
            .map_err(|_| "failed to read widget position".to_string())?,
        size: window
            .outer_size()
            .map_err(|_| "failed to read widget size".to_string())?,
    })
}

fn monitor_and_scale(
    window: &tauri::WebviewWindow,
) -> Result<(Option<tauri::Monitor>, f64), String> {
    let monitor = window
        .current_monitor()
        .map_err(|_| "failed to read monitor".to_string())?;
    let scale_factor = monitor
        .as_ref()
        .map(|item| item.scale_factor())
        .unwrap_or(1.0);
    Ok((monitor, scale_factor))
}

fn infer_mode(rect: WidgetRect, collapsed_size: PhysicalSize<u32>) -> WidgetMode {
    if rect.size.width <= collapsed_size.width + POSITION_EPSILON
        && rect.size.height <= collapsed_size.height + POSITION_EPSILON
    {
        WidgetMode::Collapsed
    } else {
        WidgetMode::Expanded
    }
}

#[tauri::command]
fn expand_widget(
    work_area: Option<WorkAreaPayload>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("widget")
        .ok_or_else(|| "widget window missing".to_string())?;
    let current = current_widget_rect(&window)?;
    let (monitor, scale_factor) = monitor_and_scale(&window)?;
    let safe_inset = safe_inset_for_current_appearance(state.inner(), scale_factor);
    let collapsed_size = PhysicalSize::new(
        widget_window_size(COLLAPSED_LOGICAL_SIZE, scale_factor, safe_inset),
        widget_window_size(COLLAPSED_LOGICAL_SIZE, scale_factor, safe_inset),
    );
    let expanded_size = PhysicalSize::new(
        widget_window_size(EXPANDED_LOGICAL_SIZE, scale_factor, safe_inset),
        widget_window_size(EXPANDED_LOGICAL_SIZE, scale_factor, safe_inset),
    );
    let Some(monitor) = monitor else {
        window
            .set_size(expanded_size)
            .map_err(|_| "failed to resize widget".to_string())?;
        return Ok(());
    };
    let threshold = logical_to_physical(SNAP_THRESHOLD_LOGICAL, scale_factor) as i32;
    let previous = state.geometry.lock().ok().and_then(|value| *value);
    let (collapsed_rect, dock) = collapsed_geometry_for_expand(
        current.position,
        collapsed_size,
        &monitor,
        threshold,
        safe_inset as i32,
        previous,
    );
    let expanded_rect = WidgetRect {
        position: expanded_position(
            collapsed_rect,
            expanded_size,
            dock,
            &monitor,
            work_area,
            safe_inset as i32,
        ),
        size: expanded_size,
    };

    if let Ok(mut geometry) = state.geometry.lock() {
        *geometry = Some(WidgetGeometryState {
            mode: WidgetMode::Expanded,
            dock,
            collapsed_rect,
            expanded_rect: Some(expanded_rect),
            user_moved_expanded: false,
        });
    }

    window
        .set_position(expanded_rect.position)
        .map_err(|_| "failed to position widget".to_string())?;
    window
        .set_size(expanded_size)
        .map_err(|_| "failed to resize widget".to_string())
}

#[cfg(test)]
mod geometry_tests {
    use super::*;

    fn rect(x: i32, y: i32, size: u32) -> WidgetRect {
        WidgetRect {
            position: PhysicalPosition::new(x, y),
            size: PhysicalSize::new(size, size),
        }
    }

    #[test]
    fn window_size_includes_the_transparent_safe_inset() {
        assert_eq!(window_size_for_visual_size(72, 4), 80);
        assert_eq!(widget_window_size(306.0, 1.5, 6), 471);
    }

    #[test]
    fn glass_padding_keeps_visible_bottom_right_edges_at_each_dpi() {
        for scale in [1.0, 1.25, 1.5, 2.0] {
            let inset = logical_to_physical(shadow_inset_for_skin(GLASS_SKIN_ID), scale);
            let collapsed = widget_window_size(72.0, scale, inset);
            let expanded = widget_window_size(306.0, scale, inset);
            let right = logical_to_physical(1920.0, scale) as i32;
            let bottom = logical_to_physical(1040.0, scale) as i32;
            let position = expanded_position_in_bounds(
                rect(right - collapsed as i32 + inset as i32, bottom - collapsed as i32 + inset as i32, collapsed),
                PhysicalSize::new(expanded, expanded),
                DockState { horizontal: Some(HorizontalDock::Right), vertical: Some(VerticalDock::Bottom) },
                PhysicalPosition::new(0, 0),
                PhysicalSize::new(right as u32, bottom as u32),
                inset as i32,
            );
            assert_eq!(position.x + expanded as i32 - inset as i32, right);
            assert_eq!(position.y + expanded as i32 - inset as i32, bottom);
        }
        for skin in ["default", BLUR_SKIN_ID, COMPUTER_SKIN_ID, NEXUS_SKIN_ID] {
            assert_eq!(shadow_inset_for_skin(skin), EDGE_SAFE_INSET_LOGICAL);
        }
    }

    #[test]
    fn expansion_stays_above_a_bottom_taskbar() {
        let position = expanded_position_in_bounds(
            rect(1844, 964, 80),
            PhysicalSize::new(314, 314),
            DockState {
                horizontal: Some(HorizontalDock::Right),
                vertical: Some(VerticalDock::Bottom),
            },
            PhysicalPosition::new(0, 0),
            PhysicalSize::new(1920, 1040),
            4,
        );
        assert_eq!(position, PhysicalPosition::new(1610, 730));
    }

    #[test]
    fn expansion_handles_negative_origin_work_areas() {
        let position = expanded_position_in_bounds(
            rect(-1284, -4, 80),
            PhysicalSize::new(314, 314),
            DockState {
                horizontal: Some(HorizontalDock::Left),
                vertical: Some(VerticalDock::Top),
            },
            PhysicalPosition::new(-1280, 0),
            PhysicalSize::new(1280, 984),
            4,
        );
        assert_eq!(position, PhysicalPosition::new(-1284, -4));
    }

    #[test]
    fn undocked_expansion_flips_inward_near_work_area_edges() {
        let position = expanded_position_in_bounds(
            rect(1750, 900, 80),
            PhysicalSize::new(314, 314),
            DockState::default(),
            PhysicalPosition::new(0, 0),
            PhysicalSize::new(1920, 1040),
            4,
        );
        assert_eq!(position, PhysicalPosition::new(1516, 666));
    }
}

#[tauri::command]
fn collapse_widget(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let window = app
        .get_webview_window("widget")
        .ok_or_else(|| "widget window missing".to_string())?;
    let current = current_widget_rect(&window)?;
    let (monitor, scale_factor) = monitor_and_scale(&window)?;
    let safe_inset = safe_inset_for_current_appearance(state.inner(), scale_factor);
    let collapsed_size = PhysicalSize::new(
        widget_window_size(COLLAPSED_LOGICAL_SIZE, scale_factor, safe_inset),
        widget_window_size(COLLAPSED_LOGICAL_SIZE, scale_factor, safe_inset),
    );
    let Some(monitor) = monitor else {
        window
            .set_size(collapsed_size)
            .map_err(|_| "failed to resize widget".to_string())?;
        return Ok(());
    };
    let threshold = logical_to_physical(SNAP_THRESHOLD_LOGICAL, scale_factor) as i32;
    let previous = state.geometry.lock().ok().and_then(|value| *value);
    let user_moved_expanded = previous
        .map(|value| value.user_moved_expanded)
        .unwrap_or(false);
    let candidate = if user_moved_expanded {
        current.position
    } else {
        previous
            .map(|value| value.collapsed_rect.position)
            .unwrap_or(current.position)
    };
    let dock = detect_dock(
        candidate,
        collapsed_size,
        &monitor,
        threshold,
        safe_inset as i32,
    );
    let next_position = if dock.is_docked() {
        snap_position(candidate, collapsed_size, dock, &monitor, safe_inset as i32)
    } else {
        clamp_position_to_monitor(candidate, collapsed_size, &monitor, safe_inset as i32)
    };
    let collapsed_rect = WidgetRect {
        position: next_position,
        size: collapsed_size,
    };
    if let Ok(mut geometry) = state.geometry.lock() {
        *geometry = Some(WidgetGeometryState {
            mode: WidgetMode::Collapsed,
            dock,
            collapsed_rect,
            expanded_rect: None,
            user_moved_expanded: false,
        });
    }
    window
        .set_size(collapsed_size)
        .map_err(|_| "failed to resize widget".to_string())?;
    window
        .set_position(next_position)
        .map_err(|_| "failed to position widget".to_string())
}

#[tauri::command]
fn begin_widget_drag(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let window = app
        .get_webview_window("widget")
        .ok_or_else(|| "widget window missing".to_string())?;
    let current = current_widget_rect(&window)?;
    let (_, scale_factor) = monitor_and_scale(&window)?;
    let safe_inset = safe_inset_for_current_appearance(state.inner(), scale_factor);
    let collapsed_size = PhysicalSize::new(
        widget_window_size(COLLAPSED_LOGICAL_SIZE, scale_factor, safe_inset),
        widget_window_size(COLLAPSED_LOGICAL_SIZE, scale_factor, safe_inset),
    );
    let mode = state
        .geometry
        .lock()
        .ok()
        .and_then(|value| *value)
        .map(|value| value.mode)
        .unwrap_or_else(|| infer_mode(current, collapsed_size));
    if let Ok(mut drag_mode) = state.drag_mode.lock() {
        *drag_mode = Some(mode);
    }
    Ok(())
}

#[tauri::command]
fn finish_widget_drag(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let window = app
        .get_webview_window("widget")
        .ok_or_else(|| "widget window missing".to_string())?;
    let current = current_widget_rect(&window)?;
    let (monitor, scale_factor) = monitor_and_scale(&window)?;
    let Some(monitor) = monitor else {
        return Ok(());
    };
    let threshold = logical_to_physical(SNAP_THRESHOLD_LOGICAL, scale_factor) as i32;
    let safe_inset = safe_inset_for_current_appearance(state.inner(), scale_factor);
    let collapsed_size = PhysicalSize::new(
        widget_window_size(COLLAPSED_LOGICAL_SIZE, scale_factor, safe_inset),
        widget_window_size(COLLAPSED_LOGICAL_SIZE, scale_factor, safe_inset),
    );
    let expanded_size = PhysicalSize::new(
        widget_window_size(EXPANDED_LOGICAL_SIZE, scale_factor, safe_inset),
        widget_window_size(EXPANDED_LOGICAL_SIZE, scale_factor, safe_inset),
    );
    let mode = state
        .drag_mode
        .lock()
        .ok()
        .and_then(|mut value| value.take())
        .or_else(|| {
            state
                .geometry
                .lock()
                .ok()
                .and_then(|value| *value)
                .map(|value| value.mode)
        })
        .unwrap_or_else(|| infer_mode(current, collapsed_size));

    match mode {
        WidgetMode::Collapsed => {
            let dock = detect_dock(
                current.position,
                collapsed_size,
                &monitor,
                threshold,
                safe_inset as i32,
            );
            let next_position = if dock.is_docked() {
                snap_position(
                    current.position,
                    collapsed_size,
                    dock,
                    &monitor,
                    safe_inset as i32,
                )
            } else {
                clamp_position_to_monitor(
                    current.position,
                    collapsed_size,
                    &monitor,
                    safe_inset as i32,
                )
            };
            let collapsed_rect = WidgetRect {
                position: next_position,
                size: collapsed_size,
            };
            window
                .set_position(next_position)
                .map_err(|_| "failed to position widget".to_string())?;
            if let Ok(mut geometry) = state.geometry.lock() {
                *geometry = Some(WidgetGeometryState {
                    mode: WidgetMode::Collapsed,
                    dock,
                    collapsed_rect,
                    expanded_rect: None,
                    user_moved_expanded: false,
                });
            }
        }
        WidgetMode::Expanded => {
            let current_position = clamp_position_to_monitor(
                current.position,
                expanded_size,
                &monitor,
                safe_inset as i32,
            );
            let updated_rect = WidgetRect {
                position: current_position,
                size: expanded_size,
            };
            window
                .set_position(current_position)
                .map_err(|_| "failed to position widget".to_string())?;
            if let Ok(mut geometry) = state.geometry.lock() {
                if let Some(mut value) = *geometry {
                    value.mode = WidgetMode::Expanded;
                    value.expanded_rect = Some(updated_rect);
                    value.user_moved_expanded = true;
                    *geometry = Some(value);
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn get_preferences(state: State<'_, AppState>) -> WidgetPreferences {
    // Preferences are always recoverable: an empty or invalid on-disk file
    // was normalized at startup, and a poisoned mutex is recovered above.
    // Do not turn a safe default into a user-facing startup error.
    preferences_lock(&state).clone()
}

#[tauri::command]
fn set_preferences(
    preferences: WidgetPreferences,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let current = preferences_lock(&state).clone();
    let preferences = renderer_preferences(&current, preferences);
    persist_preferences(&state.preferences_path, &preferences)?;
    *preferences_lock(&state) = preferences;
    Ok(())
}

fn renderer_preferences(current: &WidgetPreferences, requested: WidgetPreferences) -> WidgetPreferences {
    // License state can only be changed by the commands that validate it.
    // Never trust an arbitrary renderer payload to unlock a supporter skin.
    let mut preferences = requested.normalized();
    preferences.license = current.license.clone();
    preferences.licenses = current.licenses.clone();
    preferences.unlocked_skin = current.unlocked_skin.clone();
    preferences.unlocked_skins = current.unlocked_skins.clone();
    preferences.selected_skin = current.selected_skin.clone();
    preferences.supporter_prompt_first_seen_at = current.supporter_prompt_first_seen_at.clone();
    preferences.supporter_prompt_shown_at = current.supporter_prompt_shown_at.clone();
    preferences.supporter_prompt_revision = current.supporter_prompt_revision;
    preferences.supporter_prompt_version = current.supporter_prompt_version.clone();
    preferences.supporter_prompt_launch_count = current.supporter_prompt_launch_count;
    preferences
}

#[cfg(test)]
mod supporter_preference_tests {
    use super::*;

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_tray_uses_numeric_metric_or_error_marker() {
        let snapshot = ProviderSnapshot {
            status: "ok".into(),
            short_window: Some(UsageWindow { remaining_percent: 74.4, resets_at: None, window_seconds: 18_000 }),
            ..ProviderSnapshot::failure("unavailable", "not used")
        };
        assert_eq!(windows_tray_text(Some(&snapshot)), "74");
        assert_eq!(windows_tray_text(None), "--");
        assert_eq!(windows_tray_text(Some(&ProviderSnapshot::failure("signed_out", "sign in"))), "--");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_tray_keeps_four_numeric_digits_for_api_amounts() {
        let snapshot = ProviderSnapshot {
            status: "ok".into(),
            day_cost: Some(models::Money { amount: 100.3, currency: "USD".into() }),
            ..ProviderSnapshot::failure("unavailable", "not used")
        };
        assert_eq!(windows_tray_text(Some(&snapshot)), "100.3");
        assert_eq!(format_tray_api_amount(99.99), "99.99");
        assert_eq!(format_tray_api_amount(0.83), "0.83");
        assert_eq!(format_tray_api_amount(999.49), "999.5");
        assert_eq!(format_tray_api_amount(1_000.0), "999+");
    }

    #[test]
    fn renderer_preferences_cannot_unlock_or_select_a_supporter_skin() {
        let current = WidgetPreferences::default();
        let requested = WidgetPreferences {
            license: Some("forged".into()),
            unlocked_skin: Some(BLUR_SKIN_ID.into()),
            selected_skin: BLUR_SKIN_ID.into(),
            ..WidgetPreferences::default()
        };
        let saved = renderer_preferences(&current, requested);
        assert_eq!(saved.license, None);
        assert_eq!(saved.unlocked_skin, None);
        assert_eq!(saved.selected_skin, "default");
    }

    #[test]
    fn forged_stored_unlock_flags_do_not_activate_supporter_skins() {
        let preferences = WidgetPreferences {
            unlocked_skin: Some(BLUR_SKIN_ID.into()),
            unlocked_skins: vec![BLUR_SKIN_ID.into(), COMPUTER_SKIN_ID.into()],
            selected_skin: COMPUTER_SKIN_ID.into(),
            ..WidgetPreferences::default()
        };
        let status = supporter_status(&preferences, "QF1-FORGED-DEVICE-CODE");
        assert!(!status.active);
        assert_eq!(status.available_skins, vec!["default"]);
        assert_eq!(status.selected_skin, "default");
    }

    #[test]
    fn supporter_prompt_shows_on_first_two_launches_per_version() {
        let mut preferences = WidgetPreferences::default();
        assert!(should_show_supporter_prompt(&mut preferences, Utc::now(), "0.2.10"));
        assert!(preferences.supporter_prompt_shown_at.is_some());
        assert!(should_show_supporter_prompt(&mut preferences, Utc::now(), "0.2.10"));
        assert!(!should_show_supporter_prompt(&mut preferences, Utc::now(), "0.2.10"));
        assert!(should_show_supporter_prompt(&mut preferences, Utc::now(), "0.2.11"));
        assert!(should_show_supporter_prompt(&mut preferences, Utc::now(), "0.2.11"));
        assert!(!should_show_supporter_prompt(&mut preferences, Utc::now(), "0.2.11"));
    }

    #[test]
    fn legacy_prompt_record_does_not_suppress_new_version_or_get_reset_by_renderer() {
        let mut preferences = WidgetPreferences { supporter_prompt_revision: 1, ..WidgetPreferences::default() };
        assert!(should_show_supporter_prompt(&mut preferences, Utc::now(), "0.2.10"));
        let persisted = serde_json::to_string(&preferences).unwrap();
        let restored: WidgetPreferences = serde_json::from_str(&persisted).unwrap();
        let mut saved = renderer_preferences(&restored, WidgetPreferences::default());
        assert_eq!(saved.supporter_prompt_launch_count, 1);
        assert!(should_show_supporter_prompt(&mut saved, Utc::now(), "0.2.10"));
        assert!(!should_show_supporter_prompt(&mut saved, Utc::now(), "0.2.10"));
    }

    #[test]
    fn reconciliation_keeps_license_payloads_for_future_revalidation() {
        let raw_license = "stored-signed-license".to_string();
        let mut preferences = WidgetPreferences {
            licenses: vec![raw_license.clone()],
            unlocked_skins: vec![BLUR_SKIN_ID.into()],
            selected_skin: BLUR_SKIN_ID.into(),
            ..WidgetPreferences::default()
        };
        reconcile_supporter_fields(&mut preferences, Vec::new());
        assert_eq!(preferences.licenses, vec![raw_license]);
    }

    #[test]
    fn verified_skin_set_removes_forged_supporter_flags() {
        let mut preferences = WidgetPreferences {
            unlocked_skin: Some(COMPUTER_SKIN_ID.into()),
            unlocked_skins: vec![BLUR_SKIN_ID.into(), COMPUTER_SKIN_ID.into()],
            selected_skin: COMPUTER_SKIN_ID.into(),
            ..WidgetPreferences::default()
        };
        assert!(reconcile_supporter_fields(
            &mut preferences,
            vec![BLUR_SKIN_ID.into()]
        ));
        assert_eq!(preferences.unlocked_skin.as_deref(), Some(BLUR_SKIN_ID));
        assert_eq!(preferences.unlocked_skins, vec![BLUR_SKIN_ID]);
        assert_eq!(preferences.selected_skin, "default");
    }
}

fn verified_supporter_documents(preferences: &WidgetPreferences, request_code: &str) -> Vec<license::LicenseDocument> {
    let mut raw_licenses = preferences.licenses.clone();
    if let Some(legacy) = preferences.license.as_ref() {
        if !raw_licenses.contains(legacy) {
            raw_licenses.push(legacy.clone());
        }
    }
    let mut documents = Vec::new();
    for raw in raw_licenses {
        if let Ok(document) = parse_and_verify(&raw, request_code) {
            if !documents.iter().any(|known: &license::LicenseDocument| known.skin_id == document.skin_id) {
                documents.push(document);
            }
        }
    }
    documents
}

fn reconcile_supporter_fields(
    preferences: &mut WidgetPreferences,
    mut verified_skins: Vec<String>,
) -> bool {
    verified_skins.sort();
    verified_skins.dedup();
    let selected_skin = if preferences.selected_skin == "default"
        || verified_skins.iter().any(|skin| skin == &preferences.selected_skin)
    {
        preferences.selected_skin.clone()
    } else {
        "default".into()
    };
    let unlocked_skin = verified_skins.first().cloned();
    let changed = preferences.unlocked_skin != unlocked_skin
        || preferences.unlocked_skins != verified_skins
        || preferences.selected_skin != selected_skin;
    preferences.unlocked_skin = unlocked_skin;
    preferences.unlocked_skins = verified_skins;
    preferences.selected_skin = selected_skin;
    changed
}

fn reconcile_verified_supporter_fields(
    preferences: &mut WidgetPreferences,
    request_code: &str,
) -> bool {
    let verified_skins = verified_supporter_documents(preferences, request_code)
        .into_iter()
        .map(|document| document.skin_id)
        .collect();
    reconcile_supporter_fields(preferences, verified_skins)
}

fn supporter_status(preferences: &WidgetPreferences, request_code: &str) -> SupporterStatus {
    let documents = verified_supporter_documents(preferences, request_code);
    if !documents.is_empty() {
        let unlocked_skins = documents.iter().map(|document| document.skin_id.clone()).collect::<Vec<_>>();
        let selected_skin = if preferences.selected_skin == "default"
            || unlocked_skins.iter().any(|skin| skin == &preferences.selected_skin)
        {
            preferences.selected_skin.clone()
        } else {
            "default".into()
        };
        SupporterStatus {
            request_code: request_code.into(),
            active: true,
            message: "Supporter licenses are active.".into(),
            unlocked_skin: unlocked_skins.first().cloned(),
            unlocked_skins: unlocked_skins.clone(),
            selected_skin,
            available_skins: std::iter::once("default".into()).chain(unlocked_skins).collect(),
        }
    } else {
        SupporterStatus {
            request_code: request_code.into(),
            active: false,
            message: "No supporter license has been activated on this device.".into(),
            unlocked_skin: None,
            unlocked_skins: Vec::new(),
            selected_skin: "default".into(),
            available_skins: vec!["default".into()],
        }
    }
}

#[tauri::command]
fn get_supporter_status(state: State<'_, AppState>) -> Result<SupporterStatus, String> {
    let request_code = device_request_code()?;
    let mut preferences = preferences_lock(&state);
    let changed = reconcile_verified_supporter_fields(&mut preferences, &request_code);
    let status = supporter_status(&preferences, &request_code);
    if changed {
        // Returning the request code must not depend on a best-effort cleanup
        // of forged or obsolete supporter flags. Otherwise a transient
        // file-write failure hides the device code even though it was
        // generated safely.
        if persist_preferences(&state.preferences_path, &preferences).is_err() {
            eprintln!("failed to persist supporter skin cleanup");
        }
    }
    Ok(status)
}

#[tauri::command]
fn activate_supporter_license(
    license: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SupporterStatus, String> {
    let request_code = device_request_code()?;
    let document = parse_and_verify(&license, &request_code)?;
    let mut preferences = preferences_lock(&state);
    preferences.licenses.retain(|raw| {
        serde_json::from_str::<license::LicenseDocument>(raw)
            .map(|existing| existing.skin_id != document.skin_id)
            .unwrap_or(true)
    });
    preferences.licenses.push(license.trim().into());
    preferences.unlocked_skins.push(document.skin_id.clone());
    let mut normalized = preferences.clone().normalized();
    normalized.selected_skin = document.skin_id;
    *preferences = normalized;
    persist_preferences(&state.preferences_path, &preferences)?;
    let saved = preferences.clone();
    let _ = app.emit_to("widget", "preferences-changed", saved.clone());
    let _ = app.emit("supporter-skin-changed", saved.selected_skin.clone());
    let status = supporter_status(&saved, &request_code);
    let _ = app.emit("supporter-skins-changed", status.clone());
    Ok(status)
}

#[tauri::command]
fn select_supporter_skin(
    skin_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SupporterStatus, String> {
    let request_code = device_request_code()?;
    let mut preferences = preferences_lock(&state);
    if skin_id == "default" {
        preferences.selected_skin = "default".into();
    } else if matches!(skin_id.as_str(), BLUR_SKIN_ID | COMPUTER_SKIN_ID | GLASS_SKIN_ID | NEXUS_SKIN_ID) {
        let status = supporter_status(&preferences, &request_code);
        if !status.available_skins.iter().any(|available| available == &skin_id) {
            return Err("this skin is not activated on this device".into());
        }
        preferences.selected_skin = skin_id;
    } else {
        return Err("unknown supporter skin".into());
    }
    persist_preferences(&state.preferences_path, &preferences)?;
    let saved = preferences.clone();
    let _ = app.emit_to("widget", "preferences-changed", saved.clone());
    let _ = app.emit("supporter-skin-changed", saved.selected_skin.clone());
    Ok(supporter_status(&saved, &request_code))
}

fn apply_lock(app: &AppHandle, locked: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("widget")
        .ok_or_else(|| "widget window missing".to_string())?;
    window
        .set_ignore_cursor_events(locked)
        .map_err(|_| "failed to toggle click-through".to_string())
}

#[tauri::command]
fn set_widget_locked(
    locked: bool,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WidgetPreferences, String> {
    let previous = state
        .preferences
        .lock()
        .map_err(|_| "settings unavailable".to_string())?
        .clone();
    let mut next = previous.clone();
    next.locked = locked;
    persist_preferences(&state.preferences_path, &next)?;
    if let Err(error) = apply_lock(&app, locked) {
        let _ = persist_preferences(&state.preferences_path, &previous);
        return Err(error);
    }
    *state
        .preferences
        .lock()
        .map_err(|_| "settings unavailable".to_string())? = next.clone();
    Ok(next)
}

#[tauri::command]
fn set_widget_always_on_top(
    always_on_top: bool,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WidgetPreferences, String> {
    let previous = state
        .preferences
        .lock()
        .map_err(|_| "settings unavailable".to_string())?
        .clone();
    let mut next = previous.clone();
    next.always_on_top = always_on_top;
    persist_preferences(&state.preferences_path, &next)?;
    let window = app
        .get_webview_window("widget")
        .ok_or_else(|| "widget window missing".to_string())?;
    if let Err(error) = window.set_always_on_top(always_on_top) {
        let _ = persist_preferences(&state.preferences_path, &previous);
        return Err(format!("failed to toggle always-on-top: {error}"));
    }
    *state
        .preferences
        .lock()
        .map_err(|_| "settings unavailable".to_string())? = next.clone();
    let _ = app.emit_to("widget", "preferences-changed", next.clone());
    Ok(next)
}

#[tauri::command]
fn sync_widget_appearance(_appearance: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let window = app
        .get_webview_window("widget")
        .ok_or_else(|| "widget window missing".to_string())?;
    let current = current_widget_rect(&window)?;
    let (_, scale_factor) = monitor_and_scale(&window)?;
    let safe_inset = safe_inset_for_current_appearance(state.inner(), scale_factor);
    let expanded_threshold = logical_to_physical((COLLAPSED_LOGICAL_SIZE + EXPANDED_LOGICAL_SIZE) / 2.0, scale_factor);
    let visual_size = if current.size.width > expanded_threshold {
        EXPANDED_LOGICAL_SIZE
    } else {
        COLLAPSED_LOGICAL_SIZE
    };
    let side = widget_window_size(visual_size, scale_factor, safe_inset);
    if current.size.width != side {
        // Preserve the visible top-left when entering/leaving Glass. Cached
        // collapse anchors were measured with the old inset and must be reset.
        let previous_inset = (current.size.width as i32 - logical_to_physical(visual_size, scale_factor) as i32) / 2;
        let offset = previous_inset - safe_inset as i32;
        window.set_position(PhysicalPosition::new(current.position.x + offset, current.position.y + offset))
            .map_err(|_| "failed to position widget for appearance".to_string())?;
        if let Ok(mut geometry) = state.geometry.lock() { *geometry = None; }
    }
    window
        .set_size(PhysicalSize::new(side, side))
        .map_err(|_| "failed to resize widget for appearance".to_string())?;
    native_material::sync(&window);
    Ok(())
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show / Hide", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh now", true, None::<&str>)?;
    let update = MenuItem::with_id(app, "update", "Check for updates", true, None::<&str>)?;
    let language = MenuItem::with_id(
        app,
        "language",
        "Switch Language / 切换语言",
        true,
        None::<&str>,
    )?;
    let theme_system = CheckMenuItem::with_id(app, "theme-system", "Follow system", true, false, None::<&str>)?;
    let theme_dark = CheckMenuItem::with_id(app, "theme-dark", "Dark", true, false, None::<&str>)?;
    let theme_light = CheckMenuItem::with_id(app, "theme-light", "Light", true, false, None::<&str>)?;
    // Keep every built-in supporter skin visible. Selecting one that is not
    // activated on this device opens the supporter window instead.
    let supporter_blur = CheckMenuItem::with_id(app, "supporter-skin-blur", "Blur", true, false, None::<&str>)?;
    let supporter_computer = CheckMenuItem::with_id(app, "supporter-skin-computer", "Computer", true, false, None::<&str>)?;
    let supporter_glass = CheckMenuItem::with_id(app, "supporter-skin-glass", "Glass", true, false, None::<&str>)?;
    let supporter_nexus = CheckMenuItem::with_id(app, "supporter-skin-nexus", "Nexus", true, false, None::<&str>)?;
    let supporter_skins = Submenu::with_items(app, "Supporter skins / 支持者皮肤", true, &[&supporter_blur, &supporter_computer, &supporter_glass, &supporter_nexus])?;
    let supporter_skins_top = MenuItem::with_id(app, "supporter-skins-top", "Support developer (skins) / 赞赏开发者（皮肤）", true, None::<&str>)?;
    let quota_sources_top = MenuItem::with_id(app, "quota-sources-top", "Quota sources / 额度数据源", true, None::<&str>)?;
    // The default skin has exactly three mutually exclusive appearance
    // choices. Selecting any one also restores the free default skin.
    let default_skin = Submenu::with_items(app, "Default skin / 默认皮肤", true, &[&theme_system, &theme_dark, &theme_light])?;
    let theme = Submenu::with_items(app, "Theme / 主题", true, &[&default_skin, &supporter_skins])?;
    let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "Start at login",
        true,
        autostart_enabled,
        None::<&str>,
    )?;
    let tray_metric = CheckMenuItem::with_id(app, "tray-metric", "Show quota in tray icon", true, false, None::<&str>)?;
    #[cfg(debug_assertions)]
    let test_short_window = CheckMenuItem::with_id(
        app,
        "debug-short-window",
        "Test: simulate 5-hour quota",
        true,
        false,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let settings = Submenu::with_items(
        app,
        "Settings / 设置",
        true,
        &[&language, &autostart, &tray_metric],
    )?;
    let initial_language = app
        .try_state::<AppState>()
        .and_then(|state| {
            state
                .preferences
                .lock()
                .ok()
                .map(|prefs| prefs.language.clone())
        })
        .unwrap_or_else(|| "zh-CN".into());
    let initial_selected_skin = app
        .try_state::<AppState>()
        .and_then(|state| state.preferences.lock().ok().map(|prefs| prefs.selected_skin.clone()))
        .unwrap_or_else(|| "default".into());
    let initial_appearance = app
        .try_state::<AppState>()
        .and_then(|state| state.preferences.lock().ok().map(|prefs| prefs.appearance.clone()))
        .unwrap_or_else(|| "system".into());
    let initial_tray_metric = app
        .try_state::<AppState>()
        .and_then(|state| state.preferences.lock().ok().map(|prefs| prefs.show_tray_metric))
        .unwrap_or(false);
    let _ = supporter_blur.set_checked(initial_selected_skin == BLUR_SKIN_ID);
    let _ = supporter_computer.set_checked(initial_selected_skin == COMPUTER_SKIN_ID);
    let _ = supporter_glass.set_checked(initial_selected_skin == GLASS_SKIN_ID);
    let _ = supporter_nexus.set_checked(initial_selected_skin == NEXUS_SKIN_ID);
    let _ = theme_system.set_checked(initial_appearance == "system");
    let _ = theme_dark.set_checked(initial_appearance == "dark");
    let _ = theme_light.set_checked(initial_appearance == "light");
    let _ = tray_metric.set_checked(initial_tray_metric);
    let enabled_skins = app
        .try_state::<AppState>()
        .and_then(|state| {
            let preferences = state.preferences.lock().ok()?.clone();
            let request_code = device_request_code().ok()?;
            Some(supporter_status(&preferences, &request_code))
        })
        .map(|status| status.available_skins)
        .unwrap_or_else(|| vec!["default".into()]);
    let _ = supporter_blur.set_enabled(enabled_skins.iter().any(|skin| skin == BLUR_SKIN_ID));
    let _ = supporter_computer.set_enabled(enabled_skins.iter().any(|skin| skin == COMPUTER_SKIN_ID));
    let _ = supporter_glass.set_enabled(enabled_skins.iter().any(|skin| skin == GLASS_SKIN_ID));
    let _ = supporter_nexus.set_enabled(enabled_skins.iter().any(|skin| skin == NEXUS_SKIN_ID));
    if initial_language != "en" {
        let _ = settings.set_text("设置");
        let _ = show.set_text("显示 / 隐藏");
        let _ = refresh.set_text("立即刷新");
        let _ = update.set_text(update_menu_label(&initial_language, false));
        let _ = language.set_text("Switch to English");
        let _ = theme.set_text("主题");
        let _ = default_skin.set_text("默认皮肤");
        let _ = theme_system.set_text("跟随系统");
        let _ = theme_dark.set_text("深色");
        let _ = theme_light.set_text("浅色");
        let _ = supporter_skins.set_text("支持者皮肤");
        let _ = supporter_skins_top.set_text("赞赏开发者（皮肤）");
        let _ = quota_sources_top.set_text("额度数据源");
        let _ = autostart.set_text("开机启动");
        let _ = tray_metric.set_text("小图标显示额度");
        let _ = quit.set_text("退出");
    }
    if initial_language == "en" {
        let _ = settings.set_text("Settings");
        let _ = theme.set_text("Theme");
        let _ = default_skin.set_text("Default skin");
        let _ = theme_system.set_text("Follow system");
        let _ = theme_dark.set_text("Dark");
        let _ = theme_light.set_text("Light");
        let _ = supporter_skins.set_text("Supporter skins");
        let _ = supporter_skins_top.set_text("Support developer (skins)");
        let _ = quota_sources_top.set_text("Quota sources");
        let _ = tray_metric.set_text("Show quota in tray icon");
    }
    #[cfg(debug_assertions)]
    let menu = Menu::with_items(
        app,
        &[
            &show,
            &refresh,
            &update,
            &settings,
            &theme,
            &quota_sources_top,
            &supporter_skins_top,
            &test_short_window,
            &quit,
        ],
    )?;
    #[cfg(not(debug_assertions))]
    let menu = Menu::with_items(
        app,
        &[&show, &refresh, &update, &settings, &theme, &quota_sources_top, &supporter_skins_top, &quit],
    )?;
    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip("Quota Float");
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let autostart_menu = autostart.clone();
    let tray_metric_menu = tray_metric.clone();
    let show_menu = show.clone();
    let refresh_menu = refresh.clone();
    let update_menu = update.clone();
    let update_indicator = update.clone();
    let language_menu = language.clone();
    let settings_menu = settings.clone();
    let theme_menu = theme.clone();
    let default_skin_menu = default_skin.clone();
    let theme_system_menu = theme_system.clone();
    let theme_dark_menu = theme_dark.clone();
    let theme_light_menu = theme_light.clone();
    let theme_system_state = theme_system.clone();
    let theme_dark_state = theme_dark.clone();
    let theme_light_state = theme_light.clone();
    let supporter_skins_menu = supporter_skins.clone();
    let supporter_blur_menu = supporter_blur.clone();
    let supporter_computer_menu = supporter_computer.clone();
    let supporter_glass_menu = supporter_glass.clone();
    let supporter_nexus_menu = supporter_nexus.clone();
    let supporter_blur_state = supporter_blur.clone();
    let supporter_computer_state = supporter_computer.clone();
    let supporter_glass_state = supporter_glass.clone();
    let supporter_nexus_state = supporter_nexus.clone();
    let supporter_blur_access = supporter_blur.clone();
    let supporter_computer_access = supporter_computer.clone();
    let supporter_glass_access = supporter_glass.clone();
    let supporter_nexus_access = supporter_nexus.clone();
    let supporter_skins_top_menu = supporter_skins_top.clone();
    let quota_sources_top_menu = quota_sources_top.clone();
    let quit_menu = quit.clone();
    #[cfg(debug_assertions)]
    let test_short_window_menu = test_short_window.clone();
    let _tray_skin_listener = app.listen("supporter-skin-changed", move |event| {
        if let Ok(skin_id) = serde_json::from_str::<String>(event.payload()) {
            let _ = supporter_blur_state.set_checked(skin_id == BLUR_SKIN_ID);
            let _ = supporter_computer_state.set_checked(skin_id == COMPUTER_SKIN_ID);
            let _ = supporter_glass_state.set_checked(skin_id == GLASS_SKIN_ID);
            let _ = supporter_nexus_state.set_checked(skin_id == NEXUS_SKIN_ID);
        }
    });
    let _tray_skin_access_listener = app.listen("supporter-skins-changed", move |event| {
        if let Ok(status) = serde_json::from_str::<SupporterStatus>(event.payload()) {
            let _ = supporter_blur_access.set_enabled(status.available_skins.iter().any(|skin| skin == BLUR_SKIN_ID));
            let _ = supporter_computer_access.set_enabled(status.available_skins.iter().any(|skin| skin == COMPUTER_SKIN_ID));
            let _ = supporter_glass_access.set_enabled(status.available_skins.iter().any(|skin| skin == GLASS_SKIN_ID));
            let _ = supporter_nexus_access.set_enabled(status.available_skins.iter().any(|skin| skin == NEXUS_SKIN_ID));
        }
    });
    builder
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("widget") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
            "refresh" => {
                let _ = app.emit_to("widget", "refresh-requested", ());
            }
            "update" => {
                let _ = app.emit_to("widget", "update-check-requested", ());
            }
            "supporter-skins-top" => {
                if let Some(window) = app.get_webview_window("supporter") {
                    if let Some(state) = app.try_state::<AppState>() {
                        if let Ok(preferences) = state.preferences.lock() {
                            let english = preferences.language == "en";
                            let _ = window.set_title(if english {
                                "Quota Float · Supporter skins"
                            } else {
                                "Quota Float · 支持者皮肤"
                            });
                            let _ = app.emit_to("supporter", "preferences-changed", preferences.clone());
                        }
                    }
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quota-sources-top" => {
                if let Some(window) = app.get_webview_window("sources") {
                    if let Some(state) = app.try_state::<AppState>() {
                        if let Ok(preferences) = state.preferences.lock() {
                            let english = preferences.language == "en";
                            let _ = window.set_title(if english {
                                "Quota Float · Quota sources"
                            } else {
                                "Quota Float · 额度数据源"
                            });
                            let _ = app.emit_to("sources", "preferences-changed", preferences.clone());
                        }
                    }
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "supporter-skin-blur" | "supporter-skin-computer" | "supporter-skin-glass" | "supporter-skin-nexus" => {
                let requested_skin = match event.id.as_ref() { "supporter-skin-blur" => BLUR_SKIN_ID, "supporter-skin-glass" => GLASS_SKIN_ID, "supporter-skin-nexus" => NEXUS_SKIN_ID, _ => COMPUTER_SKIN_ID };
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(request_code) = device_request_code() {
                        if let Ok(mut preferences) = state.preferences.lock() {
                            let status = supporter_status(&preferences, &request_code);
                            if status.available_skins.iter().any(|skin| skin == requested_skin) {
                                preferences.selected_skin = requested_skin.into();
                                if persist_preferences(&state.preferences_path, &preferences).is_ok() {
                                    let saved = preferences.clone();
                                    let _ = supporter_blur_menu.set_checked(requested_skin == BLUR_SKIN_ID);
                                    let _ = supporter_computer_menu.set_checked(requested_skin == COMPUTER_SKIN_ID);
                                    let _ = supporter_glass_menu.set_checked(requested_skin == GLASS_SKIN_ID);
                                    let _ = supporter_nexus_menu.set_checked(requested_skin == NEXUS_SKIN_ID);
                                    let _ = app.emit_to("widget", "preferences-changed", saved.clone());
                                    let _ = app.emit_to("supporter", "preferences-changed", saved);
                                }
                            } else if let Some(window) = app.get_webview_window("supporter") {
                                let _ = app.emit_to("supporter", "preferences-changed", preferences.clone());
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                }
            }
            "debug-short-window" =>
            {
                #[cfg(debug_assertions)]
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(mut enabled) = state.simulate_short_window_for_testing.lock() {
                        *enabled = !*enabled;
                        let _ = test_short_window_menu.set_checked(*enabled);
                        let _ = app.emit_to("widget", "refresh-requested", ());
                    }
                }
            }
            "unlock" => {
                let _ = apply_lock(app, false);
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(mut prefs) = state.preferences.lock() {
                        prefs.locked = false;
                        let _ = persist_preferences(&state.preferences_path, &prefs);
                        let _ = app.emit_to("widget", "preferences-changed", prefs.clone());
                    }
                }
            }
            "pin" => {
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(mut prefs) = state.preferences.lock() {
                        prefs.pinned_provider = if prefs.pinned_provider.is_some() {
                            None
                        } else {
                            Some("codex".into())
                        };
                        let _ = persist_preferences(&state.preferences_path, &prefs);
                        let _ = app.emit_to("widget", "preferences-changed", prefs.clone());
                    }
                }
            }
            "language" => {
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(mut prefs) = state.preferences.lock() {
                        prefs.language = if prefs.language == "en" {
                            "zh-CN".into()
                        } else {
                            "en".into()
                        };
                        let normalized = prefs.clone().normalized();
                        *prefs = normalized.clone();
                        let _ = persist_preferences(&state.preferences_path, &normalized);
                        let english = normalized.language == "en";
                        let _ = settings_menu.set_text(if english { "Settings" } else { "设置" });
                        let _ = show_menu.set_text(if english {
                            "Show / Hide"
                        } else {
                            "显示 / 隐藏"
                        });
                        let _ = refresh_menu.set_text(if english {
                            "Refresh now"
                        } else {
                            "立即刷新"
                        });
                        let update_available = state
                            .update_available
                            .lock()
                            .map(|value| *value)
                            .unwrap_or(false);
                        let _ = update_menu.set_text(update_menu_label(&normalized.language, update_available));
                        let _ = language_menu.set_text(if english {
                            "切换到中文"
                        } else {
                            "Switch to English"
                        });
                        let _ = theme_menu.set_text(if english { "Theme" } else { "主题" });
                        let _ = default_skin_menu.set_text(if english { "Default skin" } else { "默认皮肤" });
                        let _ = theme_system_menu.set_text(if english { "Follow system" } else { "跟随系统" });
                        let _ = theme_dark_menu.set_text(if english { "Dark" } else { "深色" });
                        let _ = theme_light_menu.set_text(if english { "Light" } else { "浅色" });
                        let _ = supporter_skins_menu.set_text(if english { "Supporter skins" } else { "支持者皮肤" });
                        let _ = supporter_skins_top_menu.set_text(if english { "Support developer (skins)" } else { "赞赏开发者（皮肤）" });
                        let _ = quota_sources_top_menu.set_text(if english { "Quota sources" } else { "额度数据源" });
                        let _ = autostart_menu.set_text(if english {
                            "Start at login"
                        } else {
                            "开机启动"
                        });
                        let _ = tray_metric_menu.set_text(if english { "Show quota in tray icon" } else { "小图标显示额度" });
                        let _ = quit_menu.set_text(if english { "Quit" } else { "退出" });
                        let _ = app.emit_to("widget", "preferences-changed", normalized.clone());
                        let _ = app.emit_to("supporter", "preferences-changed", normalized.clone());
                        let _ = app.emit_to("sources", "preferences-changed", normalized);
                        if let Some(window) = app.get_webview_window("supporter") {
                            let _ = window.set_title(if english {
                                "Quota Float · Supporter skins"
                            } else {
                                "Quota Float · 支持者皮肤"
                            });
                        }
                        if let Some(window) = app.get_webview_window("sources") {
                            let _ = window.set_title(if english {
                                "Quota Float · Quota sources"
                            } else {
                                "Quota Float · 额度数据源"
                            });
                        }
                    }
                }
            }
            "tray-metric" => {
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(mut preferences) = state.preferences.lock() {
                        preferences.show_tray_metric = !preferences.show_tray_metric;
                        let saved = preferences.clone().normalized();
                        *preferences = saved.clone();
                        if persist_preferences(&state.preferences_path, &saved).is_ok() {
                            let _ = tray_metric_menu.set_checked(saved.show_tray_metric);
                            let snapshots = state
                                .snapshot_cache
                                .lock()
                                .ok()
                                .and_then(|cache| cache.as_ref().map(|(_, snapshots)| snapshots.clone()))
                                .unwrap_or_default();
                            drop(preferences);
                            let _ = app.emit_to("widget", "preferences-changed", saved.clone());
                            let _ = app.emit_to("supporter", "preferences-changed", saved);
                            sync_tray_metric(app, state.inner(), &snapshots);
                        }
                    }
                }
            }
            "theme-system" | "theme-dark" | "theme-light" => {
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(mut prefs) = state.preferences.lock() {
                        prefs.appearance = match event.id.as_ref() {
                            "theme-dark" => "dark".into(),
                            "theme-light" => "light".into(),
                            _ => "system".into(),
                        };
                        // The three free appearance choices always render the
                        // default skin. A supporter skin is selected only by
                        // its own menu item, never as an extra prerequisite.
                        prefs.selected_skin = "default".into();
                        let normalized = prefs.clone().normalized();
                        *prefs = normalized.clone();
                        if persist_preferences(&state.preferences_path, &normalized).is_ok() {
                            let _ = supporter_blur_menu.set_checked(false);
                            let _ = supporter_computer_menu.set_checked(false);
                            let _ = supporter_glass_menu.set_checked(false);
                            let _ = supporter_nexus_menu.set_checked(false);
                            let _ = theme_system_state.set_checked(normalized.appearance == "system");
                            let _ = theme_dark_state.set_checked(normalized.appearance == "dark");
                            let _ = theme_light_state.set_checked(normalized.appearance == "light");
                            let _ = app.emit_to("widget", "preferences-changed", normalized.clone());
                            let _ = app.emit_to("supporter", "preferences-changed", normalized.clone());
                            let _ = app.emit("supporter-skin-changed", normalized.selected_skin);
                        }
                    }
                }
            }
            "autostart" => {
                let manager = app.autolaunch();
                let enabled = manager.is_enabled().unwrap_or(false);
                let result = if enabled {
                    manager.disable()
                } else {
                    manager.enable()
                };
                match result {
                    Ok(()) => {
                        let _ = autostart_menu.set_checked(!enabled);
                    }
                    Err(_) => eprintln!("autostart update failed"),
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    // Do this after creating the tray and off the UI thread. A failed or slow
    // network check leaves the ordinary menu item untouched.
    let update_app = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        let Ok(updater) = update_app.updater() else {
            return;
        };
        if updater.check().await.ok().flatten().is_none() {
            return;
        }
        let language = update_app
            .try_state::<AppState>()
            .and_then(|state| {
                if let Ok(mut available) = state.update_available.lock() {
                    *available = true;
                }
                state.preferences.lock().ok().map(|prefs| prefs.language.clone())
            })
            .unwrap_or_else(|| "zh-CN".into());
        let _ = update_indicator.set_text(update_menu_label(&language, true));
    });
    Ok(())
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("widget") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(WindowStateBuilder::default().build())
        .setup(|app| {
            let data_dir = app.path().app_config_dir()?;
            let preferences_path = data_dir.join("preferences.json");
            let mut preferences = load_preferences(&preferences_path);
            match device_request_code() {
                Ok(request_code) => {
                    reconcile_verified_supporter_fields(&mut preferences, &request_code);
                }
                Err(_) => {
                    reconcile_supporter_fields(&mut preferences, Vec::new());
                }
            };
            let show_supporter_prompt = should_show_supporter_prompt(
                &mut preferences,
                Utc::now(),
                env!("CARGO_PKG_VERSION"),
            );
            // Persist the first-use timestamp immediately; persist the shown
            // marker before opening the window so a crash or restart cannot
            // produce repeated prompts.
            if preferences.supporter_prompt_first_seen_at.is_some() {
                let _ = persist_preferences(&preferences_path, &preferences);
            }
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(12))
                .redirect(reqwest::redirect::Policy::none())
                .user_agent("QuotaFloat/0.1")
                .build()
                .expect("static HTTP client configuration must be valid");
            app.manage(AppState {
                client,
                preferences: Mutex::new(preferences.clone()),
                preferences_path,
                fetch_lock: tokio::sync::Mutex::new(()),
                snapshot_cache: Mutex::new(None),
                #[cfg(debug_assertions)]
                simulate_short_window_for_testing: Mutex::new(false),
                geometry: Mutex::new(None),
                drag_mode: Mutex::new(None),
                update_available: Mutex::new(false),
            });
            if setup_tray(app).is_err() {
                eprintln!("tray setup failed; enabling taskbar fallback");
                if let Some(window) = app.get_webview_window("widget") {
                    let _ = window.set_skip_taskbar(false);
                }
            }
            if preferences.locked {
                let _ = apply_lock(app.handle(), true);
            }
            if let Some(window) = app.get_webview_window("widget") {
                let _ = window.set_always_on_top(preferences.always_on_top);
                // A saved window position can be outside the active monitor while
                // iterating in development. Keep the test widget discoverable.
                #[cfg(debug_assertions)]
                {
                    let _ = window.center();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            #[cfg(debug_assertions)]
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(800));
                    if let Some(window) = handle.get_webview_window("widget") {
                        let _ = window.set_position(PhysicalPosition::new(120, 120));
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                });
            }
            if show_supporter_prompt {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(900));
                    if let Some(window) = handle.get_webview_window("supporter") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshots,
            refresh_snapshots,
            get_source_statuses,
            connect_claude_subscription,
            connect_api_cost_source,
            disconnect_source,
            expand_widget,
            collapse_widget,
            begin_widget_drag,
            finish_widget_drag,
            get_preferences,
            set_preferences,
            set_widget_locked,
            set_widget_always_on_top,
            sync_widget_appearance,
            get_supporter_status,
            activate_supporter_license,
            select_supporter_skin
        ])
        .on_tray_icon_event(|app, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = app.get_webview_window("widget") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .on_window_event(|window, event| {
            if window.label() == "widget" && matches!(event, WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } | WindowEvent::Focused(_)) {
                if let Some(widget) = window.app_handle().get_webview_window("widget") {
                    native_material::sync(&widget);
                }
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build Quota Float");
    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Resumed) {
            let _ = app_handle.emit_to("widget", "refresh-requested", ());
        }
    });
}
