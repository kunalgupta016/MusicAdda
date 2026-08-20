# ☕ musicAdda

**Listen to YouTube together, perfectly in sync — like everyone's sitting at the same chai tapri.**

Create a room, share the link, paste a YouTube video — everyone in the room hears the same thing at the same time, chats about it, reacts in real time, and votes on what plays next. No accounts, no installs for your friends, just a link.

---

## ✨ Features

| | |
|---|---|
| 🔗 **Instant rooms** | Create a room, get a shareable link, done. No login required to join. |
| 🎬 **Synced YouTube playback** | Play/pause/seek/±10s stays in sync across every connected listener, within a fraction of a second. |
| 👑 **Multiple hosts** | Any host can grant host access to someone else — it adds them, it doesn't hand off exclusively, so a room can have several people driving playback at once. If every host disconnects, the next connected listener is promoted automatically. |
| 🔁 **Per-track repeat** | Every track has its own repeat counter — bump it to have that song play a few times in a row before the queue moves on. Adding a link that's already current or already queued bumps its counter instead of creating a duplicate row. |
| 🔇 **Personal mute** | Mute is local to you — it silences your own audio without pausing the room, and without affecting anyone else. |
| 💬 **Room chat** | A live text chat alongside the music, so it actually feels like a listening party — with a badge + browser notification if you're away when a message lands. |
| 🎉 **Floating reactions** | Drop a ❤️ 🔥 😂 👏 ☕ mid-song and watch it float up for everyone — like a live stream, zero setup. |
| 🗳️ **Upvote the queue** | Anyone can upvote a queued track — the most-upvoted song plays next. Democratic, not host-gated. |
| 🕘 **Session history** | Every track that's played is logged with a timestamp — **Replay** (host-only) jumps to it right now, **+ Queue** (anyone) adds it back to the end of the line. |

---

## 🛠️ Tech Stack

- **Frontend:** React (Vite) + Tailwind CSS
- **Backend:** Node.js + Express
- **Real-time:** Socket.io
- **Database:** MongoDB (Mongoose) — optional, for persistence across restarts
- **Playback:** YouTube IFrame Player API

The frontend and backend are fully decoupled — they only talk over HTTP and Socket.io — so they deploy independently (see [DEPLOYMENT.md](DEPLOYMENT.md)).

---

## 🚀 Quickstart

```bash
# Backend
cd server
npm install
cp .env.example .env   # optionally add a MONGODB_URI to persist rooms
npm run dev             # → http://localhost:4000

# Frontend (in a second terminal)
cd client
npm install
cp .env.example .env
npm run dev              # → http://localhost:5173
```

Open `http://localhost:5173`, hit **Start a Room**, and paste a YouTube link. To see it sync live, open the room link in a **different browser or an incognito window** — identity now persists per-browser (see below), so a second regular tab in the same browser will join as the same person, not a separate listener.

> `MONGODB_URI` is optional. Without it, rooms live entirely in memory and reset when the server restarts — everything else (sync, chat, reactions, voting) works exactly the same.

---

## 📁 Project Structure

```
groovesync/
├── server/                    Express + Socket.io backend
│   └── src/
│       ├── config/db.js       MongoDB connection (optional)
│       ├── models/Room.js     Mongoose schema (queue, history, chat, playback state)
│       ├── routes/            REST: POST /api/rooms to create a room
│       ├── sockets/           All real-time event handlers
│       ├── utils/
│       │   ├── roomManager.js In-memory room state — the real-time source of truth
│       │   └── youtube.js     URL parsing + oEmbed metadata lookup
│       └── index.js           Server entry point
│
└── client/                    React (Vite) frontend
    └── src/
        ├── pages/              Home, Room
        ├── components/         Player, chat, queue, reactions, history, etc.
        ├── hooks/useRoomSocket.js   Owns the socket connection + room state
        └── lib/                 socket client, identity, YouTube URL parsing, time formatting
```

---

## 🧠 How it works

**Real-time state.** The server keeps an in-memory `Map` of active rooms — queue, current track, playback position, connected users, chat, history. This is the actual source of truth, so nothing on the real-time path ever waits on a database round trip. MongoDB is written to in the background (fire-and-forget) purely so rooms survive a server restart.

**Sync math, not a shared clock.** Playback state is stored as `{ isPlaying, timestamp, updatedAt }`. Every client computes *"where should I be right now"* as `timestamp + (Date.now() - updatedAt) / 1000`. A listener joining mid-song, or correcting drift, computes the right position locally — the server never needs to run a ticking clock or push updates every second.

**Multiple hosts, additive not exclusive.** `hostClientIds` is a set, not a single value. Only the host's play/pause/seek/skip actions are accepted (checked server-side against that set). "Make host" adds someone alongside the existing hosts rather than replacing anyone; if every host disconnects, the next connected listener is promoted automatically.

**Democratic queue.** Every queued track carries a `votes` array. The queue is always kept sorted by vote count (ties broken by add time), so `nextSong()` — which just takes the front of the queue — naturally plays whatever the room voted for, no host approval needed.

**No duplicate rows, repeats instead.** Adding a link that matches the current track or something already queued (same video ID) doesn't create a second row — it bumps that item's `repeatCount`. When a track ends naturally, the server checks that count first: if repeats are left, the same track plays again in place; only once they're used up does the queue actually advance. A manual **Skip** always truly advances, ignoring any repeats left — skip means skip.

**Full state, not diffs.** Almost every mutation (join, queue changes, playback, votes, host changes) triggers one `sync-state` broadcast with the entire room state. Clients just replace their local copy — no incremental merge logic, no chance of drifting out of sync with the server. Chat is the one exception: it rides a lightweight dedicated event so a busy conversation doesn't force-resend the whole room state on every message.

**Identity persists across reloads, not per tab.** `clientId` lives in `localStorage`, not `sessionStorage` — a real person reloading, backgrounding, or reopening the app on their phone keeps the same identity instead of showing up as a fresh "new listener" every time (mobile browsers reload backgrounded tabs from scratch far more often than you'd expect, which is exactly what caused this before the fix).

---

## 🌐 Deploying

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for a full step-by-step guide to deploying the frontend on **Vercel** and the backend on **Render**.
