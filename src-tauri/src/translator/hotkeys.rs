use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};
use windows::Win32::Foundation::{LPARAM, WPARAM};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT,
    MOD_SHIFT, MOD_WIN,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetMessageW, PeekMessageW, PostThreadMessageW, MSG, PM_NOREMOVE, WM_HOTKEY, WM_QUIT,
};

pub const HK_AR_TO_EN: i32 = 1;
pub const HK_ANY_TO_AR: i32 = 2;
pub const HK_SCREEN_OVERLAY: i32 = 3;
pub const HK_FULLPAGE_OVERLAY: i32 = 4;
pub const HK_TOGGLE_PANEL: i32 = 5;

const WM_APP_REBIND: u32 = 0x8001;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HotkeyBindings {
    pub enabled: bool,
    pub ar_to_en: String,
    pub any_to_ar: String,
    pub screen_overlay: String,
    pub fullpage_overlay: String,
    pub toggle_panel: String,
}

static THREAD_ID: AtomicU32 = AtomicU32::new(0);
static PAUSED: AtomicBool = AtomicBool::new(false);
static PENDING_BINDINGS: OnceLock<Mutex<Option<HotkeyBindings>>> = OnceLock::new();

fn pending_lock() -> &'static Mutex<Option<HotkeyBindings>> {
    PENDING_BINDINGS.get_or_init(|| Mutex::new(None))
}

pub fn normalize_key_token(token: &str) -> String {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let arabic_map: &[(char, &str)] = &[
        ('ض', "Q"),
        ('ص', "W"),
        ('ث', "E"),
        ('ق', "R"),
        ('ف', "T"),
        ('غ', "Y"),
        ('ع', "U"),
        ('ه', "I"),
        ('خ', "O"),
        ('ح', "P"),
        ('ش', "A"),
        ('س', "S"),
        ('ي', "D"),
        ('ب', "F"),
        ('ل', "G"),
        ('ا', "H"),
        ('ت', "J"),
        ('ن', "K"),
        ('م', "L"),
        ('ئ', "Z"),
        ('ء', "X"),
        ('ؤ', "C"),
        ('ر', "V"),
        ('ى', "N"),
        ('ة', "M"),
        ('و', ","),
        ('ز', "."),
        ('ظ', "/"),
    ];

    if trimmed == "لا" {
        return "B".to_string();
    }
    let mut chars = trimmed.chars();
    if let (Some(ch), None) = (chars.next(), chars.next()) {
        for &(ar, en) in arabic_map {
            if ar == ch {
                return en.to_string();
            }
        }
        return ch.to_ascii_uppercase().to_string();
    }
    trimmed.to_ascii_uppercase()
}

pub fn parse_hotkey(spec: &str) -> Option<(u32, u32)> {
    let mut mods: u32 = MOD_NOREPEAT.0;
    let mut vk: Option<u32> = None;

    for raw_part in spec.split('+') {
        let part = raw_part.trim();
        if part.is_empty() {
            continue;
        }
        match part.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => mods |= MOD_CONTROL.0,
            "alt" => mods |= MOD_ALT.0,
            "shift" => mods |= MOD_SHIFT.0,
            "win" | "super" | "meta" => mods |= MOD_WIN.0,
            _ => {
                let norm = normalize_key_token(part);
                vk = token_to_vk(&norm);
            }
        }
    }

    vk.map(|code| (mods, code))
}

fn token_to_vk(norm: &str) -> Option<u32> {
    if norm.len() == 1 {
        let ch = norm.as_bytes()[0];
        if ch.is_ascii_uppercase() || ch.is_ascii_digit() {
            return Some(ch as u32);
        }
        return match ch as char {
            ',' => Some(0xBC),
            '.' => Some(0xBE),
            '/' => Some(0xBF),
            ';' => Some(0xBA),
            '\'' => Some(0xDE),
            '[' => Some(0xDB),
            ']' => Some(0xDD),
            '-' => Some(0xBD),
            '=' => Some(0xBB),
            '`' => Some(0xC0),
            '\\' => Some(0xDC),
            _ => None,
        };
    }

    match norm {
        "SPACE" => Some(0x20),
        "ENTER" | "RETURN" => Some(0x0D),
        "TAB" => Some(0x09),
        "ESC" | "ESCAPE" => Some(0x1B),
        "BACKSPACE" => Some(0x08),
        "INSERT" => Some(0x2D),
        "DELETE" | "DEL" => Some(0x2E),
        "HOME" => Some(0x24),
        "END" => Some(0x23),
        "PAGEUP" | "PGUP" => Some(0x21),
        "PAGEDOWN" | "PGDN" => Some(0x22),
        "LEFT" => Some(0x25),
        "UP" => Some(0x26),
        "RIGHT" => Some(0x27),
        "DOWN" => Some(0x28),
        _ if norm.starts_with('F') => {
            let num: u32 = norm[1..].parse().ok()?;
            if (1..=24).contains(&num) {
                Some(0x70 + (num - 1))
            } else {
                None
            }
        }
        _ => None,
    }
}

pub fn start_hotkey_thread<F>(initial: HotkeyBindings, on_hotkey: F)
where
    F: Fn(i32) + Send + Sync + 'static,
{
    if THREAD_ID.load(Ordering::SeqCst) != 0 {
        update_bindings(initial);
        return;
    }

    if let Ok(mut g) = pending_lock().lock() {
        *g = Some(initial);
    }

    std::thread::Builder::new()
        .name("zenith-translator-hotkeys".to_string())
        .spawn(move || unsafe {
            let mut msg = MSG::default();
            // Ensure Windows creates a message queue for this thread immediately.
            let _ = PeekMessageW(&mut msg, None, 0, 0, PM_NOREMOVE);
            let tid = GetCurrentThreadId();
            THREAD_ID.store(tid, Ordering::SeqCst);

            let mut active_ids: Vec<i32> = Vec::new();
            let mut current_bindings = pending_lock().lock().ok().and_then(|g| g.clone());

            let apply = |bindings_opt: &Option<HotkeyBindings>, registered: &mut Vec<i32>| {
                for id in registered.drain(..) {
                    let _ = UnregisterHotKey(None, id);
                }
                if PAUSED.load(Ordering::SeqCst) {
                    return;
                }
                let Some(b) = bindings_opt else {
                    return;
                };
                // Toggle shortcut remains active when translator is paused/disabled so user can reopen settings
                let toggle_only = !b.enabled;
                let items = [
                    (HK_AR_TO_EN, &b.ar_to_en, false),
                    (HK_ANY_TO_AR, &b.any_to_ar, false),
                    (HK_SCREEN_OVERLAY, &b.screen_overlay, false),
                    (HK_FULLPAGE_OVERLAY, &b.fullpage_overlay, false),
                    (HK_TOGGLE_PANEL, &b.toggle_panel, true),
                ];
                for (id, spec, allow_disabled) in items {
                    if toggle_only && !allow_disabled {
                        continue;
                    }
                    if let Some((mods, vk)) = parse_hotkey(spec) {
                        if RegisterHotKey(None, id, HOT_KEY_MODIFIERS(mods), vk).is_ok() {
                            registered.push(id);
                        }
                    }
                }
            };

            apply(&current_bindings, &mut active_ids);

            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                if msg.message == WM_HOTKEY {
                    if !PAUSED.load(Ordering::SeqCst) {
                        on_hotkey(msg.wParam.0 as i32);
                    }
                } else if msg.message == WM_APP_REBIND {
                    if let Ok(g) = pending_lock().lock() {
                        if let Some(ref b) = *g {
                            current_bindings = Some(b.clone());
                        }
                    }
                    apply(&current_bindings, &mut active_ids);
                }
            }

            for id in active_ids.drain(..) {
                let _ = UnregisterHotKey(None, id);
            }
            THREAD_ID.store(0, Ordering::SeqCst);
        })
        .ok();
}

pub fn update_bindings(bindings: HotkeyBindings) {
    if let Ok(mut g) = pending_lock().lock() {
        *g = Some(bindings);
    }
    let tid = THREAD_ID.load(Ordering::SeqCst);
    if tid != 0 {
        unsafe {
            let _ = PostThreadMessageW(tid, WM_APP_REBIND, WPARAM(0), LPARAM(0));
        }
    }
}

pub fn set_paused(paused: bool) {
    PAUSED.store(paused, Ordering::SeqCst);
    let tid = THREAD_ID.load(Ordering::SeqCst);
    if tid != 0 {
        unsafe {
            let _ = PostThreadMessageW(tid, WM_APP_REBIND, WPARAM(0), LPARAM(0));
        }
    }
}

pub fn stop_hotkey_thread() {
    let tid = THREAD_ID.load(Ordering::SeqCst);
    if tid != 0 {
        unsafe {
            let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ascii_and_arabic_hotkeys() {
        assert_eq!(parse_hotkey("Ctrl+Alt+A"), Some((MOD_NOREPEAT.0 | MOD_CONTROL.0 | MOD_ALT.0, 'A' as u32)));
        assert_eq!(parse_hotkey("Ctrl+Alt+Space"), Some((MOD_NOREPEAT.0 | MOD_CONTROL.0 | MOD_ALT.0, 0x20)));
        assert_eq!(parse_hotkey("Ctrl+Alt+ش"), Some((MOD_NOREPEAT.0 | MOD_CONTROL.0 | MOD_ALT.0, 'A' as u32)));
        assert_eq!(parse_hotkey("Ctrl+Alt+لا"), Some((MOD_NOREPEAT.0 | MOD_CONTROL.0 | MOD_ALT.0, 'B' as u32)));
        assert_eq!(parse_hotkey("Ctrl+Shift+F9"), Some((MOD_NOREPEAT.0 | MOD_CONTROL.0 | MOD_SHIFT.0, 0x78)));
    }
}
