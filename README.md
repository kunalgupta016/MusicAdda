# ☕ GrooveSync

**Listen to YouTube together, perfectly in sync — like everyone's sitting at the same chai tapri.**

Create a room, share the link, paste a YouTube video — everyone in the room hears the same thing at the same time, chats about it, reacts in real time, and votes on what plays next. No accounts, no installs for your friends, just a link.

---

## ✨ Features

| | |
|---|---|
| 🔗 **Instant rooms** | Create a room, get a shareable link, done. No login required to join. |
| 🎬 **Synced YouTube playback** | Play/pause/seek stays in sync across every connected listener, within a fraction of a second. |
| 👑 **Host control, cleanly handed off** | One host drives playback at a time. Only the host can hand control to someone else — no fighting over the remote — and if the host disconnects, control passes to the next listener automatically. |
| 🔇 **Personal mute** | Mute is local to you — it silences your own audio without pausing the room, and without affecting anyone else. |
| 💬 **Room chat** | A live text chat alongside the music, so it actually feels like a listening party. |
| 🎉 **Floating reactions** | Drop a ❤️ 🔥 😂 👏 ☕ mid-song and watch it float up for everyone — like a live stream, zero setup. |
| 🗳️ **Upvote the queue** | Anyone can upvote a queued track — the most-upvoted song plays next. Democratic, not host-gated. |
| 🕘 **Session history + replay** | Every track that's played is logged with a timestamp, one click away from being queued up again. |

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

Open `http://localhost:5173`, hit **Start a Room**, and paste a YouTube link. Open the room link in a second tab to see everything sync live.

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

**One host, explicit handoff.** Only the host's play/pause/seek/skip actions are accepted (checked server-side against `hostClientId`). Control only moves when the *current host* explicitly hands it to someone else, or automatically to the next connected listener if the host disconnects — never by a listener grabbing it themselves.

**Democratic queue.** Every queued track carries a `votes` array. The queue is always kept sorted by vote count (ties broken by add time), so `nextSong()` — which just takes the front of the queue — naturally plays whatever the room voted for, no host approval needed.

**Full state, not diffs.** Almost every mutation (join, queue changes, playback, votes, host transfer) triggers one `sync-state` broadcast with the entire room state. Clients just replace their local copy — no incremental merge logic, no chance of drifting out of sync with the server. Chat is the one exception: it rides a lightweight dedicated event so a busy conversation doesn't force-resend the whole room state on every message.

---

## 🌐 Deploying

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for a full step-by-step guide to deploying the frontend on **Vercel** and the backend on **Render**.
