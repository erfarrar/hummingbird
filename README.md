# Tea

A simple PWA that lists files in your Google Drive root folder.

## Setup

### 1. Configure your OAuth Client ID

Copy `config.example.js` to `config.js` and paste your Client ID:

```bash
cp config.example.js config.js
```

Then edit `config.js`:
```js
const CLIENT_ID = "YOUR_CLIENT_ID.apps.googleusercontent.com";
```

`config.js` is gitignored so your Client ID won't be committed.

### 2. Google Cloud project requirements

In [Google Cloud Console](https://console.cloud.google.com):

1. **Enable the Drive API**: APIs & Services → Library → "Google Drive API" → Enable.
2. **Authorized JavaScript origins**: In your OAuth 2.0 Client ID's settings, add the
   exact localhost origin you'll use, e.g. `http://localhost:8000`.
   - No redirect URI is needed (the app uses the GIS token model, not a redirect flow).

### 3. Run a local server

```bash
python3 -m http.server 8000
```

or with Node:

```bash
npx serve -l 8000
```

Then open `http://localhost:8000` in Chrome.

## Usage

1. Click **Sign in with Google** and complete the consent popup.
2. The files in your Drive root folder appear, sorted by folders first then name.
3. Click **Sign out** to clear the session.

## PWA (Chromebook)

The app registers a service worker that caches the app shell for offline use.
In Chrome DevTools → Application → Manifest you should see the app is installable —
on a Chromebook you can add it to the shelf.
