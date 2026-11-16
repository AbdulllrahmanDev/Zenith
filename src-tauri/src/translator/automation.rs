use std::ptr::copy_nonoverlapping;
use std::time::{Duration, Instant};
use windows::Win32::Foundation::{HANDLE, HGLOBAL};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardSequenceNumber,
    IsClipboardFormatAvailable, OpenClipboard, SetClipboardData,
};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS,
    KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_A, VK_C, VK_CONTROL, VK_LCONTROL, VK_LMENU, VK_LSHIFT,
    VK_LWIN, VK_MENU, VK_NEXT, VK_PRIOR, VK_RCONTROL, VK_RMENU, VK_RSHIFT, VK_RWIN, VK_SHIFT,
    VK_V,
};

const CF_UNICODETEXT_ID: u32 = 13;

fn key_input(vk: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

pub fn release_modifiers() {
    let modifiers = [
        VK_CONTROL,
        VK_LCONTROL,
        VK_RCONTROL,
        VK_SHIFT,
        VK_LSHIFT,
        VK_RSHIFT,
        VK_MENU,
        VK_LMENU,
        VK_RMENU,
        VK_LWIN,
        VK_RWIN,
    ];
    let mut inputs = Vec::new();
    for vk in modifiers {
        let state = unsafe { GetAsyncKeyState(vk.0 as i32) };
        if (state as u16 & 0x8000) != 0 {
            inputs.push(key_input(vk, KEYEVENTF_KEYUP));
        }
    }
    if !inputs.is_empty() {
        unsafe {
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}

pub fn send_ctrl_combo(vk: VIRTUAL_KEY) {
    let inputs = [
        key_input(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
        key_input(vk, KEYBD_EVENT_FLAGS(0)),
        key_input(vk, KEYEVENTF_KEYUP),
        key_input(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

pub fn send_key(vk: VIRTUAL_KEY) {
    let inputs = [
        key_input(vk, KEYBD_EVENT_FLAGS(0)),
        key_input(vk, KEYEVENTF_KEYUP),
    ];
    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

pub fn send_page_down() {
    send_key(VK_NEXT);
}

pub fn send_page_up_times(count: usize) {
    for _ in 0..count {
        send_key(VK_PRIOR);
        std::thread::sleep(Duration::from_millis(35));
    }
}

struct ClipboardGuard;

impl ClipboardGuard {
    fn open() -> Option<Self> {
        for _ in 0..8 {
            if unsafe { OpenClipboard(None).is_ok() } {
                return Some(Self);
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        None
    }
}

impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseClipboard();
        }
    }
}

pub fn read_clipboard_unicode() -> Option<String> {
    let _guard = ClipboardGuard::open()?;
    if unsafe { IsClipboardFormatAvailable(CF_UNICODETEXT_ID).is_err() } {
        return None;
    }
    let handle = unsafe { GetClipboardData(CF_UNICODETEXT_ID).ok()? };
    let hglobal = HGLOBAL(handle.0);
    let ptr = unsafe { GlobalLock(hglobal) } as *const u16;
    if ptr.is_null() {
        return None;
    }
    let mut len = 0usize;
    unsafe {
        while *ptr.add(len) != 0 {
            len += 1;
            if len > 2_000_000 {
                break;
            }
        }
        let slice = std::slice::from_raw_parts(ptr, len);
        let text = String::from_utf16_lossy(slice);
        let _ = GlobalUnlock(hglobal);
        Some(text)
    }
}

pub fn write_clipboard_unicode(text: &str) -> bool {
    let _guard = match ClipboardGuard::open() {
        Some(g) => g,
        None => return false,
    };
    if unsafe { EmptyClipboard().is_err() } {
        return false;
    }
    let utf16: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    let byte_len = utf16.len() * std::mem::size_of::<u16>();
    let hglobal = match unsafe { GlobalAlloc(GMEM_MOVEABLE, byte_len) } {
        Ok(h) => h,
        Err(_) => return false,
    };
    let dst = unsafe { GlobalLock(hglobal) } as *mut u16;
    if dst.is_null() {
        return false;
    }
    unsafe {
        copy_nonoverlapping(utf16.as_ptr(), dst, utf16.len());
        let _ = GlobalUnlock(hglobal);
        SetClipboardData(CF_UNICODETEXT_ID, Some(HANDLE(hglobal.0))).is_ok()
    }
}

pub fn capture_selected_text(select_all_fallback: bool) -> Option<String> {
    let previous = read_clipboard_unicode();
    release_modifiers();

    let seq_before = unsafe { GetClipboardSequenceNumber() };
    send_ctrl_combo(VK_C);

    let mut copied = wait_clipboard_change(seq_before, Duration::from_millis(180));

    if copied.as_deref().map(str::trim).unwrap_or("").is_empty() && select_all_fallback {
        let seq_retry = unsafe { GetClipboardSequenceNumber() };
        send_ctrl_combo(VK_A);
        std::thread::sleep(Duration::from_millis(45));
        send_ctrl_combo(VK_C);
        copied = wait_clipboard_change(seq_retry, Duration::from_millis(200));
    }

    if let Some(prev) = previous {
        let _ = write_clipboard_unicode(&prev);
    }

    copied.filter(|s| !s.trim().is_empty())
}

fn wait_clipboard_change(seq_before: u32, timeout: Duration) -> Option<String> {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if unsafe { GetClipboardSequenceNumber() } != seq_before {
            std::thread::sleep(Duration::from_millis(18));
            return read_clipboard_unicode();
        }
        std::thread::sleep(Duration::from_millis(12));
    }
    None
}

pub fn replace_selection_in_place(translated_text: &str) -> bool {
    let previous = read_clipboard_unicode();
    if !write_clipboard_unicode(translated_text) {
        return false;
    }
    release_modifiers();
    std::thread::sleep(Duration::from_millis(30));
    send_ctrl_combo(VK_V);
    std::thread::sleep(Duration::from_millis(130));
    if let Some(prev) = previous {
        let _ = write_clipboard_unicode(&prev);
    }
    true
}
