# VoiceNotes 🎙

**Speak to Remember** — a voice-powered notes PWA that works offline and can be installed to your home screen.

## Features

- 🎙 **Voice input** — tap the mic and speak to create or append to notes
- 📝 **Rich notes** — titles, tags, color labels, and full-text search
- 💾 **Auto-save** — drafts and notes persist in localStorage
- 📲 **Installable PWA** — works offline, installs like a native app
- ✏️ **Edit & delete** — inline editing with autosave

## Project Structure

```
voicenotes/
├── index.html        # Main app shell
├── manifest.json     # PWA manifest
├── sw.js             # Service worker (offline support)
├── css/
│   └── style.css     # All styles
├── js/
│   └── app.js        # All app logic
└── icons/
    ├── icon-192.png  # App icon (192×192)
    └── icon-512.png  # App icon (512×512)
```

## Deployment

Any static host works — GitHub Pages is the easiest:

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set source to `main` branch, root folder
4. Visit `https://yourusername.github.io/voicenotes/`

The Install button will appear automatically on supported browsers (Chrome, Edge) over HTTPS.

## Local Development

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .
```

Then open `http://localhost:8080` — the service worker and install prompt require a server (not `file://`).

## Browser Support

| Feature | Chrome | Firefox | Safari |
|---------|--------|---------|--------|
| Voice input | ✅ | ❌ | ✅ iOS |
| PWA install | ✅ | ❌ | ✅ iOS |
| Offline | ✅ | ✅ | ✅ |

## License

MIT
