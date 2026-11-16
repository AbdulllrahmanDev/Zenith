use image::RgbaImage;
use serde::{Deserialize, Serialize};
use windows::core::HSTRING;
use windows::Globalization::Language;
use windows::Graphics::Imaging::{BitmapDecoder, BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine;
use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

#[derive(Debug, Clone)]
pub struct RawOcrLine {
    pub left: f64,
    pub top: f64,
    pub width: f64,
    pub height: f64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrBlock {
    pub id: usize,
    pub left: f64,
    pub top: f64,
    pub width: f64,
    pub height: f64,
    pub text: String,
    pub bg_color: String,
    pub text_color: String,
    pub translated: String,
}

pub fn group_ocr_lines(raw_lines: &[RawOcrLine], img_w: u32, img_h: u32) -> Vec<OcrBlock> {
    if raw_lines.is_empty() {
        return Vec::new();
    }

    let mut sorted: Vec<&RawOcrLine> = raw_lines
        .iter()
        .filter(|l| !l.text.trim().is_empty())
        .collect();
    sorted.sort_by(|a, b| {
        let ay = (a.top / 10.0).round() * 10.0;
        let by = (b.top / 10.0).round() * 10.0;
        ay.partial_cmp(&by)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                a.left
                    .partial_cmp(&b.left)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });

    let mut groups: Vec<Vec<&RawOcrLine>> = Vec::new();

    for line in sorted {
        let mut merged = false;
        let line_bottom = line.top + line.height;

        for g in groups.iter_mut().rev().take(6) {
            let last = match g.last() {
                Some(l) => *l,
                None => continue,
            };
            let last_bottom = last.top + last.height;
            let avg_h = ((last.height + line.height) * 0.5).max(12.0);
            let v_gap = line.top - last_bottom;

            let g_left = g.iter().map(|l| l.left).fold(f64::INFINITY, f64::min);
            let g_right = g
                .iter()
                .map(|l| l.left + l.width)
                .fold(f64::NEG_INFINITY, f64::max);

            let h_overlap =
                (g_right.min(line.left + line.width) - g_left.max(line.left)).max(0.0);
            let min_w = (g_right - g_left).min(line.width).max(1.0);
            let same_row = (line.top - last.top).abs() < avg_h * 0.45
                && (line_bottom - last_bottom).abs() < avg_h * 0.55;

            if same_row {
                let h_gap = (line.left - (last.left + last.width)).max(last.left - (line.left + line.width));
                if h_gap <= avg_h * 1.4 {
                    g.push(line);
                    merged = true;
                    break;
                }
            } else if v_gap >= -avg_h * 0.3
                && v_gap <= avg_h * 1.25
                && ((h_overlap / min_w) > 0.25 || (line.left - g_left).abs() < avg_h * 2.5)
                && (line.height / last.height.max(1.0) - 1.0).abs() < 0.65
            {
                g.push(line);
                merged = true;
                break;
            }
        }

        if !merged {
            groups.push(vec![line]);
        }
    }

    let min_w = (img_w as f64) * 0.015;
    let max_x = img_w as f64;
    let max_y = img_h as f64;

    let mut out = Vec::new();
    for g in groups {
        let mut left = g.iter().map(|l| l.left).fold(f64::INFINITY, f64::min);
        let mut top = g.iter().map(|l| l.top).fold(f64::INFINITY, f64::min);
        let mut right = g
            .iter()
            .map(|l| l.left + l.width)
            .fold(f64::NEG_INFINITY, f64::max);
        let mut bottom = g
            .iter()
            .map(|l| l.top + l.height)
            .fold(f64::NEG_INFINITY, f64::max);

        left = left.clamp(0.0, max_x);
        top = top.clamp(0.0, max_y);
        right = right.clamp(0.0, max_x);
        bottom = bottom.clamp(0.0, max_y);

        let width = right - left;
        let height = bottom - top;
        if width < min_w || height < 8.0 {
            continue;
        }

        let joined = g
            .iter()
            .map(|l| l.text.trim())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        if joined.len() < 2 {
            continue;
        }

        let id = out.len();
        out.push(OcrBlock {
            id,
            left,
            top,
            width,
            height,
            text: joined,
            bg_color: "rgba(18, 22, 31, 0.86)".to_string(),
            text_color: "#f8fafc".to_string(),
            translated: String::new(),
        });
    }

    out
}

pub fn enrich_blocks_with_bg_style(rgba: &RgbaImage, blocks: &mut [OcrBlock]) {
    let w = rgba.width() as i32;
    let h = rgba.height() as i32;
    if w <= 0 || h <= 0 {
        return;
    }

    for block in blocks.iter_mut() {
        let x0 = (block.left as i32 - 3).max(0);
        let y0 = (block.top as i32 - 3).max(0);
        let x1 = ((block.left + block.width) as i32 + 3).min(w - 1);
        let y1 = ((block.top + block.height) as i32 + 3).min(h - 1);

        let mut r_sum: u64 = 0;
        let mut g_sum: u64 = 0;
        let mut b_sum: u64 = 0;
        let mut count: u64 = 0;

        let step_x = ((x1 - x0) / 10).max(1);
        let step_y = ((y1 - y0) / 6).max(1);

        for x in (x0..=x1).step_by(step_x as usize) {
            for y in [y0, y1] {
                let px = rgba.get_pixel(x as u32, y as u32);
                r_sum += px[0] as u64;
                g_sum += px[1] as u64;
                b_sum += px[2] as u64;
                count += 1;
            }
        }
        for y in (y0..=y1).step_by(step_y as usize) {
            for x in [x0, x1] {
                let px = rgba.get_pixel(x as u32, y as u32);
                r_sum += px[0] as u64;
                g_sum += px[1] as u64;
                b_sum += px[2] as u64;
                count += 1;
            }
        }

        if count == 0 {
            continue;
        }
        let r = (r_sum / count) as u8;
        let g = (g_sum / count) as u8;
        let b = (b_sum / count) as u8;
        let luma = (0.299 * r as f64) + (0.587 * g as f64) + (0.114 * b as f64);

        block.bg_color = format!("rgba({r}, {g}, {b}, 0.88)");
        block.text_color = if luma > 142.0 {
            "#0f172a".to_string()
        } else {
            "#f8fafc".to_string()
        };
    }
}

pub fn pick_nearest_ocr_lines(
    raw_lines: &[RawOcrLine],
    cursor_rel: Option<(i32, i32)>,
    limit: usize,
) -> Vec<String> {
    if raw_lines.is_empty() {
        return Vec::new();
    }
    let Some((cx, cy)) = cursor_rel else {
        return raw_lines
            .iter()
            .map(|l| l.text.trim().to_string())
            .filter(|s| !s.is_empty())
            .take(limit)
            .collect();
    };

    let mut ranked: Vec<(f64, &RawOcrLine)> = raw_lines
        .iter()
        .filter(|l| !l.text.trim().is_empty())
        .map(|l| {
            let lx = l.left + l.width * 0.5;
            let ly = l.top + l.height * 0.5;
            let dx = lx - cx as f64;
            let dy = ly - cy as f64;
            (dx * dx + dy * dy, l)
        })
        .collect();
    ranked.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    ranked
        .into_iter()
        .take(limit)
        .map(|(_, l)| l.text.trim().to_string())
        .collect()
}

struct ComGuard(bool);

impl ComGuard {
    fn enter() -> Self {
        let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        Self(hr.is_ok())
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() };
        }
    }
}

pub fn extract_raw_ocr_lines_from_png(png_bytes: &[u8]) -> Result<Vec<RawOcrLine>, String> {
    let _com = ComGuard::enter();

    let engine = OcrEngine::TryCreateFromUserProfileLanguages()
        .or_else(|_| {
            let lang = Language::CreateLanguage(&HSTRING::from("en-US"))?;
            OcrEngine::TryCreateFromLanguage(&lang)
        })
        .map_err(|e| format!("Windows OCR engine unavailable: {e}"))?;

    let stream = InMemoryRandomAccessStream::new().map_err(|e| e.to_string())?;
    let writer = DataWriter::CreateDataWriter(&stream).map_err(|e| e.to_string())?;
    writer.WriteBytes(png_bytes).map_err(|e| e.to_string())?;
    writer
        .StoreAsync()
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;
    writer
        .FlushAsync()
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;
    let _ = writer.DetachStream();
    stream.Seek(0).map_err(|e| e.to_string())?;

    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| format!("BitmapDecoder failed: {e}"))?;

    let bitmap = decoder
        .GetSoftwareBitmapAsync()
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| format!("GetSoftwareBitmap failed: {e}"))?;

    let converted = if bitmap
        .BitmapPixelFormat()
        .map(|f| f == BitmapPixelFormat::Bgra8)
        .unwrap_or(false)
    {
        bitmap
    } else {
        SoftwareBitmap::Convert(&bitmap, BitmapPixelFormat::Bgra8)
            .map_err(|e| format!("SoftwareBitmap::Convert failed: {e}"))?
    };

    let result = engine
        .RecognizeAsync(&converted)
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| format!("OCR RecognizeAsync failed: {e}"))?;

    let lines = result.Lines().map_err(|e| e.to_string())?;
    let count = lines.Size().map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(count as usize);

    for i in 0..count {
        let Ok(line) = lines.GetAt(i) else {
            continue;
        };
        let text = line
            .Text()
            .map(|s| s.to_string_lossy())
            .unwrap_or_default();
        if text.trim().is_empty() {
            continue;
        }
        let Ok(words) = line.Words() else {
            continue;
        };
        let wcount = words.Size().unwrap_or(0);
        if wcount == 0 {
            continue;
        }
        let mut left = f64::INFINITY;
        let mut top = f64::INFINITY;
        let mut right = f64::NEG_INFINITY;
        let mut bottom = f64::NEG_INFINITY;

        for j in 0..wcount {
            if let Ok(word) = words.GetAt(j) {
                if let Ok(r) = word.BoundingRect() {
                    left = left.min(r.X as f64);
                    top = top.min(r.Y as f64);
                    right = right.max((r.X + r.Width) as f64);
                    bottom = bottom.max((r.Y + r.Height) as f64);
                }
            }
        }
        if left.is_finite() && right > left && bottom > top {
            out.push(RawOcrLine {
                left,
                top,
                width: right - left,
                height: bottom - top,
                text,
            });
        }
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn groups_adjacent_lines_into_paragraphs() {
        let lines = vec![
            RawOcrLine {
                left: 100.0,
                top: 100.0,
                width: 240.0,
                height: 20.0,
                text: "First sentence line".to_string(),
            },
            RawOcrLine {
                left: 102.0,
                top: 126.0,
                width: 210.0,
                height: 20.0,
                text: "continues right below.".to_string(),
            },
            RawOcrLine {
                left: 100.0,
                top: 260.0,
                width: 190.0,
                height: 20.0,
                text: "Separate paragraph".to_string(),
            },
        ];

        let blocks = group_ocr_lines(&lines, 1200, 800);
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].text, "First sentence line continues right below.");
        assert_eq!(blocks[1].text, "Separate paragraph");
    }
}
