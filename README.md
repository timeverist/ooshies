# Rosie's Ooshie Tracker

A phone-friendly checklist for the **Disney Ooshies 2026** set (40 figures).
Tap an ooshie to mark it collected, log spares you can trade, and filter by
**All / Collected / Missing / Duplicates**.

Two people can share one live list, so you and whoever you collect with always
see the same collection.

## Running it

It's plain static files — no build step. Open `index.html` through any web
server:

```bash
python -m http.server 8777
# then visit http://localhost:8777
```

(Opening the file directly with `file://` won't work, because the app fetches
`ooshies.json`.)

## Deploying and sharing

See **[SETUP.md](SETUP.md)** — GitHub Pages hosting, then optional Firebase
setup for the shared live list.

## Credits

Character artwork is extracted from the official Disney Ooshies 2026 collector's
checklist and is © Disney, © Disney/Pixar, © MARVEL, and © & ™ Lucasfilm Ltd.
This is a personal, non-commercial collecting aid.
