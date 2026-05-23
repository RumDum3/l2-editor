#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(all(windows, not(debug_assertions)))]
    {
        if !is_elevated() {
            relaunch_elevated();
            return;
        }
    }
    l2_editor_lib::run()
}

#[cfg(all(windows, not(debug_assertions)))]
fn is_elevated() -> bool {
    use std::ffi::c_void;
    use std::mem::size_of;
    extern "system" {
        fn GetCurrentProcess() -> *mut c_void;
        fn OpenProcessToken(handle: *mut c_void, access: u32, token: *mut *mut c_void) -> i32;
        fn GetTokenInformation(
            token: *mut c_void,
            class: u32,
            info: *mut c_void,
            len: u32,
            ret_len: *mut u32,
        ) -> i32;
        fn CloseHandle(h: *mut c_void) -> i32;
    }
    const TOKEN_QUERY: u32 = 0x0008;
    const TOKEN_ELEVATION: u32 = 20;

    unsafe {
        let mut token: *mut c_void = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }
        let mut elevation: u32 = 0;
        let mut ret_len: u32 = 0;
        let ok = GetTokenInformation(
            token,
            TOKEN_ELEVATION,
            &mut elevation as *mut _ as *mut c_void,
            size_of::<u32>() as u32,
            &mut ret_len,
        );
        CloseHandle(token);
        ok != 0 && elevation != 0
    }
}

#[cfg(all(windows, not(debug_assertions)))]
fn relaunch_elevated() {
    use std::ffi::OsStr;
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;
    extern "system" {
        fn ShellExecuteW(
            hwnd: *mut std::ffi::c_void,
            verb: *const u16,
            file: *const u16,
            params: *const u16,
            dir: *const u16,
            show: i32,
        ) -> *mut std::ffi::c_void;
    }
    let exe = std::env::current_exe().expect("current_exe");
    let exe_w: Vec<u16> = exe.as_os_str().encode_wide().chain(once(0)).collect();
    let verb_w: Vec<u16> = OsStr::new("runas").encode_wide().chain(once(0)).collect();
    unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb_w.as_ptr(),
            exe_w.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1,
        );
    }
}
