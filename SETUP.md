# Ooshie Tracker — setup

Two parts. **Part 1 puts the app online.** **Part 2 makes you and your wife share one live list.**
The app works fine after Part 1 — it just saves separately on each phone until you do Part 2.

---

## Part 1 — Put it on GitHub Pages (~5 minutes)

A git repo is already initialised in this folder with everything committed, and the remote is
already set to `https://github.com/timeverist/ooshies.git`. You only need to create the repo on
GitHub and push.

1. Go to <https://github.com/new>.
   - **Repository name:** `ooshies` (must match, or update the remote to suit)
   - **Public** (free GitHub Pages needs a public repo)
   - Do **not** tick "Add a README"/.gitignore/licence — the folder already has everything, and
     an extra commit on the remote will make the first push conflict.
   - Click **Create repository**.

2. Back in this folder:

   ```bash
   git push -u origin main
   ```

   Or open the folder in GitHub Desktop and hit **Publish repository** (untick "Keep this code
   private").

3. In the repo on github.com: **Settings → Pages**
   - **Source:** Deploy from a branch
   - **Branch:** `main`, folder `/ (root)` → **Save**

4. Wait about a minute, then open:

   ```
   https://timeverist.github.io/ooshies/
   ```

   On your phone, use the browser's **Share → Add to Home Screen** and it behaves like a real app.

### A note on privacy

GitHub Pages sites are public — anyone with the link can open it, and the repo is browsable.
A `robots.txt` and a `noindex` tag are included so search engines skip it, but treat the URL as
semi-private rather than secret. Nothing sensitive is in there — it's a sticker checklist.

To publish an update later:

```bash
git add -A
git commit -m "Update"
git push
```

---

## Part 2 — Share one live list (~5 minutes, free, no card)

This uses Firebase Realtime Database. The free tier is far more than a 40-item checklist needs.

1. Go to <https://console.firebase.google.com> → **Create a project**.
   - Name it anything (`ooshies`). **Turn Google Analytics off** — you don't need it.

2. In the left sidebar: **Build → Realtime Database → Create Database**.
   - Pick a location near you (`asia-southeast1` is the closest to Australia).
   - Choose **Start in locked mode** → Enable.

3. Open the **Rules** tab, replace everything with the contents of
   [`database.rules.json`](database.rules.json) from this folder, and click **Publish**.

   These rules only allow reads and writes under a `rooms/<code>` path where the code is at
   least 10 characters, and they validate the shape of the data — so the database can't be used
   for anything other than this checklist.

4. Click the **gear icon → Project settings → General**. Scroll to "Your apps",
   click the **web** icon (`</>`), give it a nickname, and register. You'll be shown a
   `firebaseConfig` block.

5. Copy the four values into [`config.js`](config.js) in this folder:

   ```js
   window.OOSHIE_CONFIG = {
     firebase: {
       apiKey:      "AIza...",
       authDomain:  "ooshies-xxxx.firebaseapp.com",
       databaseURL: "https://ooshies-xxxx-default-rtdb.asia-southeast1.firebasedatabase.app",
       projectId:   "ooshies-xxxx"
     }
   };
   ```

   `databaseURL` is the one people miss — copy it from the Realtime Database page, not from the
   config snippet (the snippet sometimes leaves it out).

6. Commit and push:

   ```bash
   git add -A && git commit -m "Add Firebase config" && git push
   ```

7. Open the site. The badge in the header should change from **This device only** to
   **Shared & live**.

8. Pair the two devices. Pick a private code of **at least 10 characters** (letters and digits
   only) and open this once on **each** phone:

   ```
   https://timeverist.github.io/ooshies/?room=YOURSECRETCODE
   ```

   The code is remembered from then on, so afterwards the plain URL works. Both devices are now
   on the same list and ticks show up on the other phone within about a second.

   Treat the code like a password — anyone who guesses it can see and edit your list. If you
   skip this step, each device quietly generates its own code and keeps a separate list.

### Is it safe to have the Firebase key in a public repo?

Yes — a Firebase web `apiKey` is an identifier, not a secret; Google documents it as safe to
expose. The security comes from the rules in step 3. The only real consequence of the repo
being public is that someone could read the rules and see they'd still need your random
collection code to find your data.

---

## Reference

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app |
| `config.js` | Your Firebase keys (Part 2) |
| `ooshies.json` | The 40 ooshies — names, series, image paths |
| `img/` | Artwork extracted from the official checklist |
| `database.rules.json` | Paste into Firebase → Realtime Database → Rules |

### How to use the app

- **Tap an ooshie** to mark it collected. Tap again to un-mark it.
- On a collected one, use **− / +** to log spares you can trade.
- **All / Collected / Missing / Duplicates** filters are in the header.
- Everything saves instantly. It works offline and syncs when you're back online.
