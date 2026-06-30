# MealPass Scanner (Android, Expo React Native)

Native Android build of the meal-pass scanner. Ports all logic from `../counter/` (site binding in AsyncStorage, POST `/scan` with `site_id`, result overlay with avatar + YES/NO).

## Prereqs

- Node 18+
- Android phone on the same Wi-Fi as the Laravel backend
- Laravel backend running on the LAN — bind to `0.0.0.0`:
  ```bash
  cd ../backend
  php artisan serve --host=0.0.0.0 --port=8000
  ```

## Point the app at your backend

Set the API base to your **laptop's LAN IP** (not `localhost` — the phone would call itself). Either:

**A.** export per-session:
```bash
export EXPO_PUBLIC_API_BASE=http://192.168.1.159:8000/api
```

**B.** edit [src/api/client.js](src/api/client.js) and change the fallback URL.

The app will call:
- `GET /public/sites` to populate the site picker
- `POST /scan` with `{ code, site_id }` for each scanned QR

## Run in development

```bash
npm install   # only the first time
npm start
```

Install **Expo Go** from the Play Store on your phone, scan the QR the terminal prints, and the app loads. First run will prompt for camera permission.

## Build a standalone APK

For a real install-on-device build (no Expo Go), use EAS:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview
```

EAS returns a download link when the build completes. Sideload the APK onto the phone.

## Flow

1. First launch → "Select site" overlay lists active sites from `/public/sites`.
2. Tap a site → saved to AsyncStorage under `counter_site`, overlay dismissed.
3. Point camera at an employee QR → `/scan` fires → green "YES" or red "NO" overlay inside the viewfinder, auto-dismisses after ~2.5 s.
4. Tap the site pill in the top-right to change the bound site at any time.
