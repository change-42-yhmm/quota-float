//! Native material lives inside the widget window; CSS still draws its shadow.
use tauri::Manager;
use super::{AppState, GLASS_SKIN_ID, NEXUS_SKIN_ID, shadow_inset_for_skin};
#[cfg(target_os = "windows")]
#[path = "native_material_windows.rs"]
mod windows;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Surface {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub radius: f64,
}

// Nexus's CSS clip path, retaining its diagonal corners and right-hand cutout.
pub const NEXUS_POINTS: &[(f64, f64)] = &[
    (0., 18.), (18., 0.), (290., 0.), (298., 8.), (298., 184.),
    (282., 204.), (282., 262.), (298., 281.), (298., 306.),
    (10., 306.), (0., 296.),
];

fn surface(skin: &str, expanded: bool) -> Option<Surface> {
    match skin {
        GLASS_SKIN_ID => {
            let size = if expanded { 306. } else { 72. };
            let inset = shadow_inset_for_skin(skin);
            Some(Surface { x: inset, y: inset, width: size, height: size, radius: if expanded { 38. } else { 24. } })
        }
        NEXUS_SKIN_ID if expanded => Some(Surface { x: 0., y: 1., width: 298., height: 306., radius: 0. }),
        _ => None,
    }
}

pub fn sync(window: &tauri::WebviewWindow) {
    let widget = window.clone();
    let _ = window.run_on_main_thread(move || {
        let Some(state) = widget.try_state::<AppState>() else { return; };
        let skin = super::preferences_lock(&state).selected_skin.clone();
        #[cfg(target_os = "macos")]
        let preferences = super::preferences_lock(&state).clone();
        let (Ok(size), Ok(scale)) = (widget.inner_size(), widget.scale_factor()) else { return; };
        let shape = surface(&skin, size.width as f64 / scale > 200.);
        #[cfg(target_os = "macos")]
        if let Ok(handle) = widget.ns_window() {
            let s = shape.unwrap_or(Surface { x: 0., y: 0., width: 0., height: 0., radius: 0. });
            let points: Vec<f64> = NEXUS_POINTS.iter().flat_map(|&(x, y)| [x, y]).collect();
            unsafe { quota_update_material(handle, s.x, s.y, s.width, s.height, s.radius,
                points.as_ptr(), NEXUS_POINTS.len(),
                macos_material_code(&preferences.macos_material),
                macos_appearance_code(&preferences.macos_material_appearance),
                macos_blending_code(&preferences.macos_material_blending),
                macos_state_code(&preferences.macos_material_state)) };
        }
        #[cfg(target_os = "windows")]
        if let Ok(hwnd) = widget.hwnd() {
            if let Err(error) = windows::sync(hwnd, shape, scale) {
                eprintln!("native desktop material unavailable: {error}");
            }
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        let _ = (shape, NEXUS_POINTS);
    });
}

#[cfg(target_os = "macos")]
fn macos_material_code(value: &str) -> i64 {
    match value { "popover" => 6, "menu" => 5, "sidebar" => 7, "under-window-background" => 21, "window-background" => 12, _ => 13 }
}
#[cfg(target_os = "macos")]
fn macos_appearance_code(value: &str) -> i64 { match value { "light" => 1, "dark" => 2, _ => 0 } }
#[cfg(target_os = "macos")]
fn macos_blending_code(value: &str) -> i64 { if value == "within-window" { 0 } else { 1 } }
#[cfg(target_os = "macos")]
fn macos_state_code(value: &str) -> i64 { match value { "follows-window" => 0, "inactive" => 2, _ => 1 } }

#[cfg(target_os = "macos")]
extern "C" {
    fn quota_update_material(window: *mut std::ffi::c_void, x: f64, y: f64, width: f64,
        height: f64, radius: f64, points: *const f64, count: usize, material: i64,
        appearance: i64, blending: i64, state: i64);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_material_excludes_shadow_padding_and_other_skins() {
        for expanded in [false, true] {
            let s = surface("glass", expanded).unwrap();
            assert_eq!(s.x, shadow_inset_for_skin("glass"));
            assert_eq!(s.width, if expanded { 306. } else { 72. });
            for skin in ["default", "blur", "computer"] { assert!(surface(skin, expanded).is_none()); }
        }
        assert!(surface("nexus", false).is_none());
        assert_eq!(surface("nexus", true).unwrap().width, 298.);
    }
}
