# Horalator Web

The static, installable web version of **Horalator**, a Turkish work-hours calculator.

Enter a start and end time, and Horalator calculates breaks, net daily hours, weekly totals, and target differences. Everything runs in the browser; there is no backend, account, analytics, or ad code.

## Features

- Daily gross time, automatic break, net work time, and 8-hour target.
- Quick-fill presets that learn frequently used start/end pairs for daily entry, plus a separate learned duration list for calendar entry dialogs.
- Week-by-week calendar with month grouping, current-week highlighting, and totals.
- Manual duration entry directly on the calendar for any day in the current week or any other date.
- Click any day in the home page week summary to enter or edit its duration.
- 24-hour time entry and display (military format) throughout the app, with automatic `:` insertion after two digits and no AM/PM.
- Add, edit, and delete workdays. Sundays are intentionally excluded.
- One-tap clearing for daily time fields, single calendar days, whole weeks, and months, with an undo action for deleted records.
- Calendar stored locally in the browser with `localStorage`.
- JSON export/import, compatible with the Android app's backup format.
- Light, dark, and system themes.
- Optional weekday reminders while the page or installed app is running.
- Installable PWA with an offline app shell and app icons.
- Responsive desktop and mobile layout.

## Local preview

There is no build step. Serve the folder with any static file server:

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080>.

Opening `index.html` directly works for the basic calculator, but service workers, notifications, and PWA installation require `localhost` or HTTPS.

## Deploy to GitHub Pages

A workflow is included at `.github/workflows/pages.yml` and publishes the repository root.

1. Push this repository to GitHub.
2. Open **Settings → Pages → Build and deployment**.
3. Set **Source** to **GitHub Actions**.
4. Push to `main` (or run **Deploy web to GitHub Pages** manually).

The site will be available at `https://<username>.github.io/<repository>/`. All asset paths are relative, so it works from a project subpath without configuration.

## Data and privacy

- Calendar data is stored under `horalator.workData.v1` in the browser on the current device.
- Nothing is uploaded to a server.
- Use **Settings → Export** before clearing browser data or switching devices.
- Import accepts both date-only keys and ISO timestamp keys from older Android backups.

## Browser reminders

Browsers cannot wake a page just to show a local notification. Reminders run while the Horalator tab or installed PWA is open. If notification permission is unavailable, the app shows an in-page reminder instead.

## Files

- `index.html` — app shell
- `css/styles.css` — responsive light/dark UI
- `js/app.js` — calculations, calendar, storage, reminders, import/export
- `sw.js` — offline app-shell service worker
- `manifest.webmanifest` — PWA metadata
- `icons/` — app icons
- `.github/workflows/pages.yml` — GitHub Pages deployment

## Android app

The Android version is available on the [Play Store](https://play.google.com/store/apps/details?id=com.renda.horalator&campaignid=web_share).
