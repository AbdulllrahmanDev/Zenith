# Prayer times: how it fits together

## Files

| File | Role |
|---|---|
| `src/utils/prayerSchedule.ts` | Pure rules: which prayer is next, which alerts are due, cache keys, API URL, response validation. Unit-tested in `scripts/prayerSchedule.test.ts`. |
| `src/utils/prayerContent.ts` | Arabic names, reminders and status messages. The one place to translate. |
| `src/hooks/usePrayerTimes.ts` | App-level hook: settings, fetching, alert delivery, banner and audio state. |
| `src/hooks/usePrayerCountdown.ts` | Per-second countdown, used only by the panel so a closed panel costs nothing. |
| `src/components/PrayerTimesPanel.tsx` | The panel. Takes the app-level state as a prop; it never creates its own. |
| `src/components/AthanNotchBanner.tsx` | Collapsed pill and expanded card, for the athan and the 15-minute reminder. |
| `src/components/prayer/PrayerArt.tsx` | Emblem, prayer icons, mosque scenes, pattern. Vector only. |
| `src/components/prayer/prayer.css` | Theme variables and the Arabic font shared by the panel and the banner. |

## One owner window

Every notch window (`main`, `main-2`, `main-3`) runs `App`, so every window calls
`usePrayerTimes`. Only the `main` window is the **owner**
(`usePrayerTimes({ owner: true })`). The owner fetches times, checks alerts every
second and plays the athan. The others follow:

- times: the owner writes them to localStorage, and the others re-read them on the
  `storage` event (all windows share one profile);
- banner: the owner emits `zenith-athan-banner`; every window shows it;
- audio state: `zenith-athan-state`;
- stopping from any window: `zenith-athan-stop`, handled by the owner;
- settings window test buttons: `zenith-test-athan` and `zenith-test-notification`,
  handled by the owner.

This is why the athan plays once however many monitors are connected.

## Alert rules

- An alert is due when its moment falls inside the interval since the last tick, so a
  stalled timer cannot lose it. Alerts more than two minutes late are dropped, so
  waking from sleep does not play a stale athan.
- Each alert fires once per day. The last 12 ids are kept in
  `zenith-prayer-fired`, so a restart or remount cannot repeat one.
- `resolveAlertPolicy` combines the prayer alert type (`sound_notification`,
  `notification_only`, `off`) with the global notification switches. Notification
  only never plays sound.

## Cache

Cached times are valid only for the same day, place and calculation method
(`cacheKeyFor`). Changing the city or method fetches again straight away. If a fetch
fails, the old times stay on screen marked as out of date, the panel says why, and the
owner retries after five minutes. Nothing is guessed: with no known place the panel
asks the user to choose one.

## Theming

The art and styles use only `--zenith-text`, `--zenith-text-muted`, `--zenith-border`,
`--zenith-group-bg` and `--zenith-accent`, so they follow dark, light, custom and
adaptive themes. Do not add fixed colours.
