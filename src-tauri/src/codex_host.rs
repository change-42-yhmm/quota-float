//! Windows-only integration that keeps the quota widget inside the Codex window.

#[cfg(windows)]
mod windows_host {
    use std::{
        sync::atomic::{AtomicIsize, Ordering},
        thread,
        time::Duration,
    };

    use tauri::{AppHandle, Manager};
    use windows_sys::Win32::{
        Foundation::{CloseHandle, BOOL, HWND, LPARAM, RECT},
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        },
        UI::{
            HiDpi::GetDpiForWindow,
            WindowsAndMessaging::{
                EnumWindows, GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
                SetWindowLongPtrW, SetWindowPos, ShowWindow, GWLP_HWNDPARENT, SWP_NOACTIVATE,
                SWP_NOZORDER, SW_HIDE, SW_SHOWNA,
            },
        },
    };

    const BASE_DPI: u32 = 96;
    const RIGHT_MARGIN: i32 = 24;
    const BOTTOM_MARGIN: i32 = 24;
    const EXPANDED_WIDGET_SIZE: i32 = 320;
    const COLLAPSED_WIDGET_SIZE: i32 = 100;
    static WIDGET_HWND: AtomicIsize = AtomicIsize::new(0);

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    struct WidgetLayout {
        x: i32,
        y: i32,
        width: i32,
        height: i32,
    }

    struct WindowSearch {
        hwnd: HWND,
        area: i64,
    }

    unsafe extern "system" fn find_codex_window(hwnd: HWND, result: LPARAM) -> BOOL {
        if hwnd as isize == WIDGET_HWND.load(Ordering::Relaxed) || IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        let mut process_id = 0;
        GetWindowThreadProcessId(hwnd, &mut process_id);
        if process_id == 0 {
            return 1;
        }
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
        if process.is_null() {
            return 1;
        }
        let mut path = [0u16; 1024];
        let mut length = path.len() as u32;
        let ok = QueryFullProcessImageNameW(process, 0, path.as_mut_ptr(), &mut length);
        CloseHandle(process);
        if ok == 0 {
            return 1;
        }
        let executable = String::from_utf16_lossy(&path[..length as usize]);
        let executable_lower = executable.to_ascii_lowercase();
        let name = executable.rsplit(['\\', '/']).next().unwrap_or_default();
        let is_current_codex_shell =
            name.eq_ignore_ascii_case("chatgpt.exe") && executable_lower.contains("openai.codex_");
        if name.eq_ignore_ascii_case("codex.exe") || is_current_codex_shell {
            let mut rect: RECT = std::mem::zeroed();
            if GetWindowRect(hwnd, &mut rect) != 0 {
                let area = i64::from((rect.right - rect.left).max(0))
                    * i64::from((rect.bottom - rect.top).max(0));
                let search = &mut *(result as *mut WindowSearch);
                if area > search.area {
                    search.hwnd = hwnd;
                    search.area = area;
                }
            }
        }
        1
    }

    fn codex_window() -> HWND {
        let mut result = WindowSearch {
            hwnd: std::ptr::null_mut(),
            area: 0,
        };
        unsafe {
            EnumWindows(
                Some(find_codex_window),
                &mut result as *mut WindowSearch as LPARAM,
            );
        }
        result.hwnd
    }

    fn attach(widget: HWND, parent: HWND) {
        unsafe {
            // An owned popup follows the ChatGPT window without the cross-process
            // DPI resizing and clipping caused by SetParent/WS_CHILD.
            SetWindowLongPtrW(widget, GWLP_HWNDPARENT, parent as isize);
        }
    }

    fn parent_bounds(parent: HWND) -> Option<(i32, i32, i32, i32)> {
        unsafe {
            let mut parent_rect: RECT = std::mem::zeroed();
            if GetWindowRect(parent, &mut parent_rect) == 0 {
                return None;
            }
            Some((
                parent_rect.left,
                parent_rect.top,
                parent_rect.right,
                parent_rect.bottom,
            ))
        }
    }

    fn current_layout(widget: HWND) -> Option<WidgetLayout> {
        unsafe {
            let mut widget_rect: RECT = std::mem::zeroed();
            if GetWindowRect(widget, &mut widget_rect) == 0 {
                return None;
            }
            Some(WidgetLayout {
                x: widget_rect.left,
                y: widget_rect.top,
                width: (widget_rect.right - widget_rect.left).max(1),
                height: (widget_rect.bottom - widget_rect.top).max(1),
            })
        }
    }

    fn scale_logical(value: i32, dpi: u32) -> i32 {
        let dpi = if dpi == 0 { BASE_DPI } else { dpi };
        ((i64::from(value) * i64::from(dpi) + i64::from(BASE_DPI / 2)) / i64::from(BASE_DPI)) as i32
    }

    fn target_layout(bounds: (i32, i32, i32, i32), expanded: bool, dpi: u32) -> WidgetLayout {
        let logical_size = if expanded {
            EXPANDED_WIDGET_SIZE
        } else {
            COLLAPSED_WIDGET_SIZE
        };
        let width = scale_logical(logical_size, dpi);
        let height = scale_logical(logical_size, dpi);
        let right_margin = scale_logical(RIGHT_MARGIN, dpi);
        let bottom_margin = scale_logical(BOTTOM_MARGIN, dpi);
        WidgetLayout {
            x: (bounds.2 - width - right_margin).max(bounds.0),
            y: (bounds.3 - height - bottom_margin).max(bounds.1),
            width,
            height,
        }
    }

    fn parent_layout(parent: HWND, expanded: bool) -> Option<WidgetLayout> {
        let bounds = parent_bounds(parent)?;
        let dpi = unsafe { GetDpiForWindow(parent) };
        Some(target_layout(bounds, expanded, dpi))
    }

    fn apply_layout(widget: HWND, layout: WidgetLayout) -> Result<(), String> {
        unsafe {
            let result = SetWindowPos(
                widget,
                std::ptr::null_mut(),
                layout.x,
                layout.y,
                layout.width,
                layout.height,
                SWP_NOACTIVATE | SWP_NOZORDER,
            );
            if result == 0 {
                return Err("failed to apply widget layout".to_string());
            }
        }
        Ok(())
    }

    pub fn apply_expanded(app: &AppHandle, expanded: bool) -> Result<(), String> {
        let window = app
            .get_webview_window("widget")
            .ok_or_else(|| "widget window missing".to_string())?;
        let raw = window
            .hwnd()
            .map_err(|_| "widget window handle unavailable".to_string())?;
        let widget = raw.0 as HWND;
        WIDGET_HWND.store(widget as isize, Ordering::Relaxed);
        let parent = codex_window();
        if parent.is_null() {
            let logical_size = if expanded {
                EXPANDED_WIDGET_SIZE as f64
            } else {
                COLLAPSED_WIDGET_SIZE as f64
            };
            return window
                .set_size(tauri::LogicalSize::new(logical_size, logical_size))
                .map_err(|_| "failed to resize widget".to_string());
        }
        attach(widget, parent);
        let layout = parent_layout(parent, expanded)
            .ok_or_else(|| "host window bounds unavailable".to_string())?;
        apply_layout(widget, layout)
    }

    pub fn start(app: AppHandle) {
        thread::spawn(move || {
            let Some(window) = app.get_webview_window("widget") else {
                return;
            };
            let Ok(raw) = window.hwnd() else { return };
            let widget = raw.0 as HWND;
            WIDGET_HWND.store(widget as isize, Ordering::Relaxed);
            let mut attached_parent: HWND = std::ptr::null_mut();
            let mut shown = false;

            loop {
                let parent = codex_window();
                if parent.is_null() {
                    if shown {
                        unsafe {
                            ShowWindow(widget, SW_HIDE);
                        }
                        shown = false;
                    }
                    attached_parent = std::ptr::null_mut();
                } else {
                    let Some(state) = app.try_state::<crate::AppState>() else {
                        thread::sleep(Duration::from_millis(300));
                        continue;
                    };
                    let Ok(_layout_guard) = state.layout_lock.lock() else {
                        thread::sleep(Duration::from_millis(300));
                        continue;
                    };
                    if parent != attached_parent {
                        attach(widget, parent);
                        attached_parent = parent;
                    }
                    let (panel_visible, expanded) = state
                        .preferences
                        .lock()
                        .map(|prefs| (prefs.panel_visible, prefs.expanded))
                        .unwrap_or((true, true));
                    if let Some(layout) = parent_layout(parent, expanded) {
                        if current_layout(widget) != Some(layout) {
                            let _ = apply_layout(widget, layout);
                        }
                    }
                    let should_show = panel_visible
                        && unsafe { IsIconic(parent) == 0 && IsWindowVisible(parent) != 0 };
                    if should_show != shown {
                        unsafe {
                            ShowWindow(widget, if should_show { SW_SHOWNA } else { SW_HIDE });
                        }
                        shown = should_show;
                    }
                }
                thread::sleep(Duration::from_millis(300));
            }
        });
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn target_layout_scales_size_margin_and_anchor_for_common_dpis() {
            let bounds = (0, 0, 1600, 900);
            for (dpi, expanded_size, collapsed_size, margin) in
                [(96, 320, 100, 24), (120, 400, 125, 30), (144, 480, 150, 36)]
            {
                let expanded = target_layout(bounds, true, dpi);
                assert_eq!(expanded.width, expanded_size);
                assert_eq!(expanded.height, expanded_size);
                assert_eq!(expanded.x, bounds.2 - expanded_size - margin);
                assert_eq!(expanded.y, bounds.3 - expanded_size - margin);

                let collapsed = target_layout(bounds, false, dpi);
                assert_eq!(collapsed.width, collapsed_size);
                assert_eq!(collapsed.height, collapsed_size);
                assert_eq!(collapsed.x, bounds.2 - collapsed_size - margin);
                assert_eq!(collapsed.y, bounds.3 - collapsed_size - margin);
            }
        }

        #[test]
        fn target_layout_keeps_negative_origin_monitors_in_bounds() {
            let bounds = (-1920, -200, 0, 880);
            let layout = target_layout(bounds, false, 144);
            assert_eq!(
                layout,
                WidgetLayout {
                    x: -186,
                    y: 694,
                    width: 150,
                    height: 150
                }
            );
            assert!(layout.x >= bounds.0);
            assert!(layout.y >= bounds.1);
        }
    }
}

#[cfg(windows)]
pub use windows_host::{apply_expanded, start};

#[cfg(not(windows))]
pub fn apply_expanded(app: &tauri::AppHandle, expanded: bool) -> Result<(), String> {
    use tauri::Manager;

    let window = app
        .get_webview_window("widget")
        .ok_or_else(|| "widget window missing".to_string())?;
    let logical_size = if expanded { 320.0 } else { 100.0 };
    window
        .set_size(tauri::LogicalSize::new(logical_size, logical_size))
        .map_err(|_| "failed to resize widget".to_string())
}

#[cfg(not(windows))]
pub fn start(_app: tauri::AppHandle) {}
