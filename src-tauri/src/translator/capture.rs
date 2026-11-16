use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::{DynamicImage, ImageFormat, Rgba, RgbaImage};
use std::io::Cursor;
use std::mem::size_of;
use std::time::Duration;
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    GetMonitorInfoW, MonitorFromPoint, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, CAPTUREBLT, DIB_RGB_COLORS, MONITORINFO, MONITOR_DEFAULTTONEAREST, RGBQUAD, SRCCOPY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetAncestor, GetClassNameW, GetCursorPos, GetForegroundWindow, GetWindowRect, IsWindowVisible,
    WindowFromPoint, GA_ROOT,
};

use super::automation::{release_modifiers, send_page_down, send_page_up_times};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CaptureRect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

#[derive(Debug, Clone)]
pub struct WindowCapture {
    pub rect: CaptureRect,
    pub cursor_rel: Option<(i32, i32)>,
    pub rgba: RgbaImage,
    pub png_bytes: Vec<u8>,
}

const SHELL_WINDOW_CLASSES: &[&str] = &[
    "Shell_TrayWnd",
    "Shell_SecondaryTrayWnd",
    "Progman",
    "WorkerW",
    "DV2ControlHost",
];

pub fn get_cursor_pos() -> (i32, i32) {
    let mut pt = POINT::default();
    if unsafe { GetCursorPos(&mut pt) }.is_ok() {
        (pt.x, pt.y)
    } else {
        (0, 0)
    }
}

pub type MonitorBounds = (i32, i32, i32, i32);

pub fn get_monitor_areas(pt: (i32, i32)) -> (MonitorBounds, MonitorBounds) {
    unsafe {
        let hmon = MonitorFromPoint(POINT { x: pt.0, y: pt.1 }, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO {
            cbSize: size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(hmon, &mut mi).as_bool() {
            let full = (
                mi.rcMonitor.left,
                mi.rcMonitor.top,
                (mi.rcMonitor.right - mi.rcMonitor.left).max(1),
                (mi.rcMonitor.bottom - mi.rcMonitor.top).max(1),
            );
            let work = (
                mi.rcWork.left,
                mi.rcWork.top,
                (mi.rcWork.right - mi.rcWork.left).max(1),
                (mi.rcWork.bottom - mi.rcWork.top).max(1),
            );
            return (work, full);
        }
    }
    ((0, 0, 1920, 1080), (0, 0, 1920, 1080))
}

fn get_window_class(hwnd: HWND) -> String {
    let mut buf = [0u16; 128];
    let len = unsafe { GetClassNameW(hwnd, &mut buf) };
    if len <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buf[..len as usize])
}

fn resolve_window_rect(hwnd: HWND) -> Option<CaptureRect> {
    let mut rect = RECT::default();
    let got_dwm = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut rect as *mut _ as *mut _,
            size_of::<RECT>() as u32,
        )
    }
    .is_ok();

    if (!got_dwm || rect.right <= rect.left || rect.bottom <= rect.top)
        && unsafe { GetWindowRect(hwnd, &mut rect) }.is_err()
    {
        return None;
    }

    let w = rect.right - rect.left;
    let h = rect.bottom - rect.top;
    if w < 120 || h < 80 {
        return None;
    }
    Some(CaptureRect {
        x: rect.left,
        y: rect.top,
        w,
        h,
    })
}

fn find_target_window_rect(cursor: (i32, i32)) -> CaptureRect {
    let (work, _) = get_monitor_areas(cursor);
    let mon_rect = CaptureRect {
        x: work.0,
        y: work.1,
        w: work.2,
        h: work.3,
    };

    let candidates = unsafe {
        let under = WindowFromPoint(POINT {
            x: cursor.0,
            y: cursor.1,
        });
        let fg = GetForegroundWindow();
        [under, fg]
    };

    for cand in candidates {
        if cand.0.is_null() {
            continue;
        }
        let root = unsafe { GetAncestor(cand, GA_ROOT) };
        let target = if !root.0.is_null() { root } else { cand };
        if !unsafe { IsWindowVisible(target) }.as_bool() {
            continue;
        }
        let cls = get_window_class(target);
        if SHELL_WINDOW_CLASSES.iter().any(|s| *s == cls) {
            continue;
        }
        if let Some(wr) = resolve_window_rect(target) {
            // Clamp window bounds to monitor work area.
            let left = wr.x.max(mon_rect.x);
            let top = wr.y.max(mon_rect.y);
            let right = (wr.x + wr.w).min(mon_rect.x + mon_rect.w);
            let bottom = (wr.y + wr.h).min(mon_rect.y + mon_rect.h);
            let w = right - left;
            let h = bottom - top;
            if w >= 200 && h >= 140 {
                return CaptureRect { x: left, y: top, w, h };
            }
        }
    }

    mon_rect
}

pub fn encode_png(rgba: &RgbaImage) -> Result<Vec<u8>, String> {
    let mut out = Cursor::new(Vec::new());
    DynamicImage::ImageRgba8(rgba.clone())
        .write_to(&mut out, ImageFormat::Png)
        .map_err(|e| format!("PNG encode failed: {e}"))?;
    Ok(out.into_inner())
}

pub fn encode_png_base64_data_url(png_bytes: &[u8]) -> String {
    format!("data:image/png;base64,{}", BASE64.encode(png_bytes))
}

pub fn capture_screen_rect(rect: CaptureRect) -> Result<RgbaImage, String> {
    if rect.w <= 0 || rect.h <= 0 || rect.w > 8192 || rect.h > 8192 {
        return Err(format!("Invalid capture dimensions: {}x{}", rect.w, rect.h));
    }

    unsafe {
        let hdc_screen = GetDC(None);
        if hdc_screen.is_invalid() {
            return Err("GetDC(None) failed".to_string());
        }
        let hdc_mem = CreateCompatibleDC(Some(hdc_screen));
        if hdc_mem.is_invalid() {
            let _ = ReleaseDC(None, hdc_screen);
            return Err("CreateCompatibleDC failed".to_string());
        }
        let hbm = CreateCompatibleBitmap(hdc_screen, rect.w, rect.h);
        if hbm.is_invalid() {
            let _ = DeleteDC(hdc_mem);
            let _ = ReleaseDC(None, hdc_screen);
            return Err("CreateCompatibleBitmap failed".to_string());
        }
        let old = SelectObject(hdc_mem, hbm.into());

        let blt_ok = BitBlt(
            hdc_mem,
            0,
            0,
            rect.w,
            rect.h,
            Some(hdc_screen),
            rect.x,
            rect.y,
            SRCCOPY | CAPTUREBLT,
        )
        .is_ok();

        let mut pixels = vec![0u8; (rect.w as usize) * (rect.h as usize) * 4];
        let mut got_bits = false;

        if blt_ok {
            let mut bmi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: rect.w,
                    biHeight: -rect.h,
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    biSizeImage: 0,
                    biXPelsPerMeter: 0,
                    biYPelsPerMeter: 0,
                    biClrUsed: 0,
                    biClrImportant: 0,
                },
                bmiColors: [RGBQUAD::default(); 1],
            };
            if GetDIBits(
                hdc_mem,
                hbm,
                0,
                rect.h as u32,
                Some(pixels.as_mut_ptr() as *mut _),
                &mut bmi,
                DIB_RGB_COLORS,
            ) != 0
            {
                for px in pixels.as_chunks_mut::<4>().0 {
                    px.swap(0, 2);
                    px[3] = 255;
                }
                got_bits = true;
            }
        }

        SelectObject(hdc_mem, old);
        let _ = DeleteObject(hbm.into());
        let _ = DeleteDC(hdc_mem);
        let _ = ReleaseDC(None, hdc_screen);

        if !got_bits {
            return Err("Screen BitBlt/GetDIBits failed".to_string());
        }

        RgbaImage::from_raw(rect.w as u32, rect.h as u32, pixels)
            .ok_or_else(|| "RgbaImage construction failed".to_string())
    }
}

pub fn capture_window_under_cursor() -> Result<WindowCapture, String> {
    let cursor = get_cursor_pos();
    let rect = find_target_window_rect(cursor);
    let rgba = capture_screen_rect(rect)?;
    let png_bytes = encode_png(&rgba)?;
    let rel = if cursor.0 >= rect.x
        && cursor.0 < rect.x + rect.w
        && cursor.1 >= rect.y
        && cursor.1 < rect.y + rect.h
    {
        Some((cursor.0 - rect.x, cursor.1 - rect.y))
    } else {
        None
    };

    Ok(WindowCapture {
        rect,
        cursor_rel: rel,
        rgba,
        png_bytes,
    })
}

pub fn capture_region_rect(rect: CaptureRect) -> Result<WindowCapture, String> {
    let rgba = capture_screen_rect(rect)?;
    let png_bytes = encode_png(&rgba)?;
    Ok(WindowCapture {
        rect,
        cursor_rel: None,
        rgba,
        png_bytes,
    })
}

fn draw_filled_circle(img: &mut RgbaImage, cx: i32, cy: i32, radius: i32, color: Rgba<u8>) {
    let w = img.width() as i32;
    let h = img.height() as i32;
    let r2 = radius * radius;
    for dy in -radius..=radius {
        for dx in -radius..=radius {
            if dx * dx + dy * dy <= r2 {
                let x = cx + dx;
                let y = cy + dy;
                if x >= 0 && y >= 0 && x < w && y < h {
                    img.put_pixel(x as u32, y as u32, color);
                }
            }
        }
    }
}

fn draw_ring(
    img: &mut RgbaImage,
    cx: i32,
    cy: i32,
    outer_r: i32,
    inner_r: i32,
    color: Rgba<u8>,
) {
    let w = img.width() as i32;
    let h = img.height() as i32;
    let o2 = outer_r * outer_r;
    let i2 = inner_r * inner_r;
    for dy in -outer_r..=outer_r {
        for dx in -outer_r..=outer_r {
            let d2 = dx * dx + dy * dy;
            if d2 <= o2 && d2 >= i2 {
                let x = cx + dx;
                let y = cy + dy;
                if x >= 0 && y >= 0 && x < w && y < h {
                    img.put_pixel(x as u32, y as u32, color);
                }
            }
        }
    }
}

pub fn annotate_cursor_reticle(rgba: &RgbaImage, cx: i32, cy: i32) -> Result<Vec<u8>, String> {
    let mut marked = rgba.clone();
    draw_ring(&mut marked, cx, cy, 24, 19, Rgba([15, 23, 42, 235]));
    draw_ring(&mut marked, cx, cy, 21, 17, Rgba([255, 255, 255, 245]));
    draw_filled_circle(&mut marked, cx, cy, 5, Rgba([15, 23, 42, 255]));
    draw_filled_circle(&mut marked, cx, cy, 3, Rgba([248, 250, 252, 255]));
    encode_png(&marked)
}

fn row_luma_vec(img: &RgbaImage, y: u32, step_x: usize) -> Vec<i16> {
    let w = img.width() as usize;
    let mut out = Vec::with_capacity(w / step_x + 1);
    let raw = img.as_raw();
    let row_off = (y as usize) * w * 4;
    for x in (0..w).step_by(step_x) {
        let i = row_off + x * 4;
        let lum = (raw[i] as i16 * 30 + raw[i + 1] as i16 * 59 + raw[i + 2] as i16 * 11) / 100;
        out.push(lum);
    }
    out
}

fn find_vertical_overlap(prev: &RgbaImage, curr: &RgbaImage) -> Option<usize> {
    let w = prev.width().min(curr.width());
    let h = prev.height().min(curr.height()) as usize;
    if w < 64 || h < 120 {
        return None;
    }

    let step_x = 4usize;
    let max_overlap = (h as f32 * 0.85) as usize;
    let min_overlap = 28usize.min(max_overlap);
    if min_overlap >= max_overlap {
        return None;
    }

    let sample_rows = 24usize;
    let mut best_overlap = None;
    let mut best_diff = f64::MAX;

    for overlap in (min_overlap..=max_overlap).step_by(4) {
        let mut total_diff = 0u64;
        let mut total_samples = 0u64;

        for s in 0..sample_rows {
            let offset = (overlap * s) / sample_rows;
            let py = (prev.height() as usize - overlap + offset) as u32;
            let cy = offset as u32;
            let r1 = row_luma_vec(prev, py, step_x);
            let r2 = row_luma_vec(curr, cy, step_x);
            for (a, b) in r1.iter().zip(r2.iter()) {
                total_diff += (*a - *b).unsigned_abs() as u64;
                total_samples += 1;
            }
        }

        if total_samples > 0 {
            let mean_diff = total_diff as f64 / total_samples as f64;
            if mean_diff < best_diff {
                best_diff = mean_diff;
                best_overlap = Some(overlap);
            }
        }
    }

    if best_diff < 9.5 {
        best_overlap
    } else {
        None
    }
}

pub fn stitch_scroll_frames(frames: &[RgbaImage], max_height: u32) -> Result<RgbaImage, String> {
    let first = frames
        .first()
        .ok_or_else(|| "No scroll frames captured".to_string())?;
    let w = first.width();
    let mut slices: Vec<(usize, &RgbaImage, u32)> = vec![(0, first, 0)];
    let mut total_h = first.height();

    for i in 1..frames.len() {
        let prev = &frames[i - 1];
        let curr = &frames[i];
        if curr.raw_pixel_eq(prev) {
            break;
        }
        let overlap = find_vertical_overlap(prev, curr).unwrap_or(0);
        let skip_top = overlap.min(curr.height() as usize - 1) as u32;
        let add_h = curr.height().saturating_sub(skip_top);
        if add_h < 24 {
            break;
        }
        if total_h + add_h > max_height {
            let clipped = max_height.saturating_sub(total_h);
            if clipped > 0 {
                slices.push((i, curr, skip_top));
                total_h += clipped;
            }
            break;
        }
        slices.push((i, curr, skip_top));
        total_h += add_h;
    }

    let mut out = RgbaImage::new(w, total_h);
    let mut dst_y = 0u32;
    for (_, frame, skip_top) in slices {
        let copy_w = frame.width().min(w);
        for sy in skip_top..frame.height() {
            if dst_y >= total_h {
                break;
            }
            for sx in 0..copy_w {
                out.put_pixel(sx, dst_y, *frame.get_pixel(sx, sy));
            }
            dst_y += 1;
        }
    }

    Ok(out)
}

trait RawEq {
    fn raw_pixel_eq(&self, other: &Self) -> bool;
}

impl RawEq for RgbaImage {
    fn raw_pixel_eq(&self, other: &Self) -> bool {
        self.dimensions() == other.dimensions() && self.as_raw() == other.as_raw()
    }
}

pub fn capture_scrollable_page(max_pages: usize) -> Result<WindowCapture, String> {
    let cursor = get_cursor_pos();
    let rect = find_target_window_rect(cursor);

    release_modifiers();
    let mut frames = Vec::with_capacity(max_pages.max(1));
    let first = capture_screen_rect(rect)?;
    frames.push(first);

    let mut scrolled = 0usize;
    for _ in 0..max_pages.saturating_sub(1) {
        send_page_down();
        scrolled += 1;
        std::thread::sleep(Duration::from_millis(240));
        let next = capture_screen_rect(rect)?;
        let same = frames
            .last()
            .map(|prev| prev.raw_pixel_eq(&next))
            .unwrap_or(false);
        frames.push(next);
        if same {
            break;
        }
    }

    if scrolled > 0 {
        send_page_up_times(scrolled);
    }

    let stitched = stitch_scroll_frames(&frames, 7200)?;
    let png_bytes = encode_png(&stitched)?;

    Ok(WindowCapture {
        rect: CaptureRect {
            x: rect.x,
            y: rect.y,
            w: stitched.width() as i32,
            h: stitched.height() as i32,
        },
        cursor_rel: None,
        rgba: stitched,
        png_bytes,
    })
}

pub fn compute_card_position(
    cursor: (i32, i32),
    work: (i32, i32, i32, i32),
    card_w: i32,
    card_h: i32,
    saved: Option<(i32, i32)>,
) -> (i32, i32) {
    let (wx, wy, ww, wh) = work;
    let margin = 12;
    let max_x = (wx + ww - card_w - margin).max(wx + margin);
    let max_y = (wy + wh - card_h - margin).max(wy + margin);

    if let Some((sx, sy)) = saved {
        return (sx.clamp(wx + margin, max_x), sy.clamp(wy + margin, max_y));
    }

    let mut x = cursor.0 + 18;
    if x + card_w + margin > wx + ww {
        x = cursor.0 - card_w - 18;
    }
    let mut y = cursor.1 + 22;
    if y + card_h + margin > wy + wh {
        y = cursor.1 - card_h - 18;
    }

    (x.clamp(wx + margin, max_x), y.clamp(wy + margin, max_y))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn card_position_clamps_to_work_area() {
        let pos = compute_card_position((1900, 1060), (0, 0, 1920, 1080), 420, 220, None);
        assert!(pos.0 <= 1920 - 420 - 12);
        assert!(pos.1 <= 1080 - 220 - 12);
        assert!(pos.0 >= 12);
        assert!(pos.1 >= 12);

        let saved_clamped =
            compute_card_position((100, 100), (0, 0, 1920, 1080), 420, 220, Some((2500, -50)));
        assert_eq!(saved_clamped, (1920 - 420 - 12, 12));
    }
}
