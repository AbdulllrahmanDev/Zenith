# Credits

Third-party material that ships with or is used by Zenith. Zenith's own code is
licensed under the GPL-3.0 (see `LICENSE` and `NOTICE`).

## Fonts

- **Noto Naskh Arabic** (variable, Arabic subset) used for prayer names and
  reminders. Copyright 2022 The Noto Project Authors. SIL Open Font License 1.1.
  Licence text: `src/assets/fonts/NotoNaskhArabic-OFL.txt`.
- **Syne** (800) used in the settings window. SIL Open Font License 1.1.
  Licence text: `src/assets/fonts/Syne-OFL.txt`.

## Services the prayer feature calls

- **Aladhan** (`api.aladhan.com`) for prayer times and the Hijri date.
- **ipapi.co** to find an approximate city when location is set to automatic.
  Nothing is sent when a city is chosen manually.

## Still to document

- `public/sounds/athan.mp3`: recording source and licence. Add them here before
  distributing builds.

## Artwork

The prayer emblem, prayer icons and mosque scenes are original vector drawings
in `src/components/prayer/PrayerArt.tsx`. They use no photographs or third-party art.
