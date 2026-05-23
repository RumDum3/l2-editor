#[cfg(windows)]
use std::path::{Path, PathBuf};

#[cfg(windows)]
#[tauri::command]
pub async fn probe_l2_protocol(client_root: String) -> Result<u32, String> {
    use std::time::Duration;

    let dir = PathBuf::from(&client_root).join("system");
    let exe = dir.join("L2.exe");
    if !exe.is_file() {
        return Err(format!("L2.exe not found at {}", exe.display()));
    }

    let pid = spawn_hidden(&exe, &dir).map_err(|e| format!("spawn L2.exe: {e}"))?;

    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    let mut found: Option<String> = None;
    while std::time::Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(50));
        if let Some(text) = scrape_windows_for_pid(pid) {
            if !text.trim().is_empty() {
                found = Some(text);
                break;
            }
        }
    }

    close_pid(pid);

    let text = found.ok_or_else(|| {
        "L2.exe didn't open a protocol dialog within 5s. This client build may not support `-L2ProtocolVersion`.".to_string()
    })?;

    let n = PROTOCOL_RE
        .captures_iter(&text)
        .filter_map(|c| c.get(1))
        .filter_map(|m| m.as_str().parse::<u32>().ok())
        .max()
        .ok_or_else(|| format!("no number in dialog text: {:?}", text))?;
    Ok(n)
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn probe_l2_protocol(_client_root: String) -> Result<u32, String> {
    Err("L2 protocol probe is Windows-only.".to_string())
}

#[cfg(windows)]
static PROTOCOL_RE: std::sync::LazyLock<regex::Regex> =
    std::sync::LazyLock::new(|| regex::Regex::new(r"\b(\d{3,7})\b").unwrap());

#[cfg(windows)]
fn spawn_hidden(exe: &Path, dir: &Path) -> Result<u32, String> {
    use std::ffi::OsStr;
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        CreateProcessW, PROCESS_INFORMATION, STARTF_USESHOWWINDOW, STARTUPINFOW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE;

    let cmd = format!(r#""{}" -L2ProtocolVersion"#, exe.display());
    let mut cmd_w: Vec<u16> = OsStr::new(&cmd).encode_wide().chain(once(0)).collect();
    let cwd_w: Vec<u16> = dir.as_os_str().encode_wide().chain(once(0)).collect();

    let mut si: STARTUPINFOW = unsafe { std::mem::zeroed() };
    si.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE as u16;

    let mut pi: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };

    let ok = unsafe {
        CreateProcessW(
            std::ptr::null(),
            cmd_w.as_mut_ptr(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            0,
            0,
            std::ptr::null(),
            cwd_w.as_ptr(),
            &si,
            &mut pi,
        )
    };

    if ok == 0 {
        return Err(format!("CreateProcessW failed: {}", std::io::Error::last_os_error()));
    }

    let pid = pi.dwProcessId;
    unsafe {
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }
    Ok(pid)
}

#[cfg(windows)]
fn scrape_windows_for_pid(target_pid: u32) -> Option<String> {
    use windows_sys::Win32::Foundation::{HWND, LPARAM, BOOL};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumChildWindows, EnumWindows, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId, ShowWindow, SW_HIDE,
    };

    struct Scrape {
        pid: u32,
        out: Vec<String>,
    }
    let mut state = Scrape { pid: target_pid, out: Vec::new() };

    unsafe extern "system" fn child_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let state = &mut *(lparam as *mut Scrape);
        if let Some(t) = read_window_text(hwnd) {
            state.out.push(t);
        }
        1
    }
    unsafe extern "system" fn top_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let state = &mut *(lparam as *mut Scrape);
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == state.pid {
            ShowWindow(hwnd, SW_HIDE);
            if let Some(t) = read_window_text(hwnd) {
                state.out.push(t);
            }
            EnumChildWindows(hwnd, Some(child_proc), lparam);
        }
        1
    }
    unsafe fn read_window_text(hwnd: HWND) -> Option<String> {
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return None;
        }
        let mut buf: Vec<u16> = vec![0u16; (len + 1) as usize];
        let n = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if n <= 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buf[..n as usize]))
    }

    unsafe {
        EnumWindows(Some(top_proc), &mut state as *mut _ as LPARAM);
    }
    if state.out.is_empty() {
        None
    } else {
        Some(state.out.join("\n"))
    }
}

#[cfg(windows)]
fn close_pid(pid: u32) {
    use windows_sys::Win32::Foundation::{HWND, LPARAM, BOOL};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, PostMessageW, WM_CLOSE,
    };
    struct Ctx {
        pid: u32,
    }
    unsafe extern "system" fn proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &*(lparam as *const Ctx);
        let mut wp: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut wp);
        if wp == ctx.pid {
            PostMessageW(hwnd, WM_CLOSE, 0, 0);
        }
        1
    }
    let ctx = Ctx { pid };
    unsafe { EnumWindows(Some(proc), &ctx as *const _ as LPARAM) };
}
