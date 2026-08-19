# Deploying GrooveSync — step by step

Personal reference for deploying this project: **frontend → Vercel**, **backend → Render**, **database → MongoDB Atlas** (you already have this set up). This file is for you — feel free to keep it out of the public repo (add it to `.gitignore`) or leave it in, your call.

The tricky part is a chicken-and-egg dependency: the backend needs to know the frontend's URL (for CORS), and the frontend needs to know the backend's URL (to connect). The order below avoids back-and-forth guessing — you'll do one small update at the end and you're done.

---

## 0. Push to GitHub first

Both Vercel and Render deploy by connecting to a GitHub repo.

```bash
cd D:\Learning\groovesync
git init
git add .
git commit -m "Initial commit"
```

Create a new repo on GitHub (empty, no README/gitignore), then:

```bash
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

**Before you push**, double check `.env` files are *not* tracked (they're already in `.gitignore` for both `client/` and `server/` — the ones with your real Mongo URI must never be committed). Run `git status` and confirm neither `client/.env` nor `server/.env` shows up as staged.

---

## 1. Deploy the backend to Render

1. Go to [render.com](https://render.com) → **New** → **Web Service**.
2. Connect your GitHub account and select the `groovesync` repo.
3. Configure the service:
   - **Name:** `groovesync-server` (or anything)
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free is fine to start (see the note on sleep behavior below)
4. Add environment variables (**Environment** tab):
   | Key | Value |
   |---|---|
   | `MONGODB_URI` | Your Atlas connection string (same one in `server/.env`) |
   | `CLIENT_ORIGIN` | Leave as `http://localhost:5173` for now — you'll update this in step 3 |

   Don't set `PORT` — Render injects it automatically, and `server/src/index.js` already reads `process.env.PORT`.
5. Click **Create Web Service** and wait for the first deploy to finish.
6. Once it's live, copy the URL Render gives you — something like `https://groovesync-server.onrender.com`. You'll need it in the next step.
7. Sanity check: open `https://groovesync-server.onrender.com/health` in a browser — you should see `{"ok":true}`.

### MongoDB Atlas network access

Render's free tier doesn't use a fixed outbound IP, so Atlas needs to accept connections from anywhere:

1. In Atlas, go to **Network Access** → **Add IP Address**.
2. Choose **Allow Access from Anywhere** (`0.0.0.0/0`).
3. Confirm. (Your database is still protected by the username/password in the connection string — this just controls which IPs are allowed to *attempt* a connection.)

---

## 2. Deploy the frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**.
2. Import the same GitHub repo.
3. Configure the project:
   - **Root Directory:** `client` (click "Edit" next to Root Directory and select it — important, this is a monorepo)
   - **Framework Preset:** Vite (should auto-detect)
   - **Build Command:** `npm run build` (default, leave as-is)
   - **Output Directory:** `dist` (default, leave as-is)
4. Add environment variable (**Environment Variables** section):
   | Key | Value |
   |---|---|
   | `VITE_SERVER_URL` | The Render URL from step 1, e.g. `https://groovesync-server.onrender.com` |
5. Click **Deploy**.
6. Once live, copy the URL Vercel gives you — something like `https://groovesync.vercel.app`.

> **Important:** Vite environment variables are baked in at *build* time, not read at runtime. If you ever change `VITE_SERVER_URL` later, you must trigger a new deploy (Vercel does this automatically if you edit the env var and hit "Redeploy") — restarting alone won't pick it up.

---

## 3. Close the loop — update the backend's CLIENT_ORIGIN

Now that you have the real Vercel URL:

1. Back in Render, open your `groovesync-server` service → **Environment**.
2. Update `CLIENT_ORIGIN` to your Vercel URL, e.g. `https://groovesync.vercel.app` (no trailing slash).
3. Save — Render will automatically restart the service with the new value. No rebuild needed, this one's read at runtime.

---

## 4. Test it live

1. Open your Vercel URL, click **Start a Room**.
2. Copy the room link and open it in a second device or an incognito tab.
3. Paste a YouTube link, confirm playback syncs, chat works, reactions float, voting reorders the queue.

If the room fails to load or the socket never connects, it's almost always one of:
- `CLIENT_ORIGIN` on Render doesn't exactly match the Vercel URL (check for a trailing slash mismatch or `http` vs `https`)
- `VITE_SERVER_URL` on Vercel is missing the `https://` prefix or points at the wrong Render URL
- Atlas network access isn't set to allow Render's IPs (see step 1)

---

## Known limitation: Render free tier sleep

Render's free web services spin down after ~15 minutes of no traffic, and take 30–60 seconds to wake back up on the next request. For a casual listening room this just means the *first* person to open a room after a quiet period waits a bit for the initial connection — after that it behaves normally. If you want this to feel instant for real use, upgrade the Render service to a paid instance (no sleep) — nothing else about the setup changes.

---

## Redeploying after future changes

- **Backend changes:** just `git push` — Render auto-deploys on push to `main` by default.
- **Frontend changes:** same — Vercel auto-deploys on push. If you only changed an environment variable (not code), redeploy manually from the Vercel dashboard.
