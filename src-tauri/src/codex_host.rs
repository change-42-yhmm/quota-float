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
        UI::WindowsAndMessaging::{
            EnumWindows, GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
            SetWindowLongPtrW, SetWindowPos, ShowWindow, GWLP_HWNDPARENT, SWP_NOACTIVATE,
            SWP_NOSIZE, SWP_NOZORDER, SW_HIDE, SW_SHOWNA,
        },
    };

    const RIGHT_MARGIN: i32 = 24;
    const BOTTOM_MARGIN: i32 = 24;
    const LOGICAL_WIDGET_SIZE: i32 = 320;
    static WIDGET_HWND: AtomicIsize = AtomicIsize::new(0);

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

    fn position_bottom_right(widget: HWND, bounds: (i32, i32, i32, i32)) {
        unsafe {
            let mut widget_rect: RECT = std::mem::zeroed();
            if GetWindowRect(widget, &mut widget_rect) == 0 {
                return;
            }
            let width = (widget_rect.right - widget_rect.left).max(1);
            let height = (widget_rect.bottom - widget_rect.top).max(1);
            // SetWindowPos uses physical pixels here. Scale the visual margin from
            // the window's DPI-adjusted size, but never resize the webview: forcing
            // 320 physical pixels clips a 320-CSS-pixel panel at 150% display scale.
            let right_margin = RIGHT_MARGIN * width / LOGICAL_WIDGET_SIZE;
            let bottom_margin = BOTTOM_MARGIN * height / LOGICAL_WIDGET_SIZE;
            let x = (bounds.2 - width - right_margin).max(bounds.0);
            let y = (bounds.3 - height - bottom_margin).max(bounds.1);
            SetWindowPos(
                widget,
                std::ptr::null_mut(),
                x,
                y,
                0,
                0,
                SWP_NOACTIVATE | SWP_NOSIZE | SWP_NOZORDER,
            );
        }
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
            let mut last_parent_bounds = None;
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
                    last_parent_bounds = None;
                } else {
                    if parent != attached_parent {
                        attach(widget, parent);
                        attached_parent = parent;
                        last_parent_bounds = None;
                    }
                    if let Some(bounds) = parent_bounds(parent) {
                        if last_parent_bounds != Some(bounds) {
                            position_bottom_right(widget, bounds);
                            last_parent_bounds = Some(bounds);
                        }
                    }
                    let panel_visible = app
                        .try_state::<crate::AppState>()
                        .and_then(|state| {
                            state
                                .preferences
                                .lock()
                                .ok()
                                .map(|prefs| prefs.panel_visible)
                        })
                        .unwrap_or(true);
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
}

#[cfg(windows)]
pub use windows_host::start;

#[cfg(not(windows))]
pub fn start(_app: tauri::AppHandle) {}
