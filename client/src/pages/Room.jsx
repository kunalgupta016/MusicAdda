import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { useWakeLock } from "../hooks/useWakeLock";
import { useMediaSession } from "../hooks/useMediaSession";
import { getSavedName, saveName } from "../lib/identity";
import YoutubePlayer from "../components/YoutubePlayer";
import ReactionOverlay from "../components/ReactionOverlay";
import ReactionPicker from "../components/ReactionPicker";
import NowPlayingBar from "../components/NowPlayingBar";
import QueueList from "../components/QueueList";
import UserList from "../components/UserList";
import AddTrackForm from "../components/AddTrackForm";
import ChatPanel from "../components/ChatPanel";
import HistoryPanel from "../components/HistoryPanel";

function NameGate({ onSubmit }) {
  const [name, setName] = useState(getSavedName());

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    saveName(trimmed);
    onSubmit(trimmed);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="board-frame w-full max-w-sm rounded-2xl bg-tapri-paper px-6 py-8 text-center rotate-1">
        <p className="font-chalk text-tapri-terracotta-dark">Welcome to the adda ☕</p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-tapri-brown">Join the Room</h1>
        <p className="mt-1 text-sm text-tapri-brown-light">Pick a name and grab a seat.</p>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={24}
          className="board-frame-sm mt-6 w-full rounded-lg bg-tapri-cream px-3 py-2 text-center text-tapri-brown placeholder-tapri-brown-light/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="tapri-btn mt-4 w-full rounded-lg bg-tapri-terracotta px-4 py-2 font-heading font-semibold text-tapri-cream hover:bg-tapri-terracotta-dark disabled:opacity-50"
        >
          Let's Go
        </button>
      </form>
    </div>
  );
}

export default function Room() {
  const { roomId } = useParams();
  const [name, setName] = useState(getSavedName());

  if (!name) return <NameGate onSubmit={setName} />;
  return <RoomView roomId={roomId} name={name} />;
}

function RoomView({ roomId, name }) {
  const { clientId, state, status, error, isHost, chatMessages, actions } = useRoomSocket(roomId, name);

  const playerRef = useRef(null);
  const [duration, setDuration] = useState(0);
  // Starts muted: browsers block autoplay-with-sound for a player that has
  // never had a genuine click on this page. Starting muted guarantees the
  // very first sync (and every auto-advance after it) actually plays instead
  // of silently failing for anyone who joins and never clicks anything —
  // one click on the mute button is enough to unlock sound for the rest of
  // the session, since that click itself counts as the required gesture.
  const [muted, setMuted] = useState(true);
  const loadedTrackIdRef = useRef(null);
  const [copied, setCopied] = useState(false);

  const handlePlayerReady = useCallback((player) => {
    playerRef.current = player;
    player.mute();
  }, []);

  // YoutubePlayer registers onStateChange once, at mount, and never again —
  // so this closure is frozen at whatever isHost/state were right then.
  // With multiple hosts now possible mid-session (via "Make host"), isHost
  // can flip long after mount, so it — and state, needed below for repeat
  // count — have to be read through refs instead of the closed-over values,
  // or a newly-promoted host's play/pause/ended events would silently never
  // reach the server.
  const isHostRef = useRef(isHost);
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const handleStateChange = useCallback((e) => {
    const YT = window.YT;
    if (!YT) return;
    setDuration(playerRef.current?.getDuration() || 0);

    if (!isHostRef.current) return;
    if (e.data === YT.PlayerState.PLAYING) {
      actions.play(playerRef.current.getCurrentTime());
    } else if (e.data === YT.PlayerState.PAUSED) {
      actions.pause(playerRef.current.getCurrentTime());
    } else if (e.data === YT.PlayerState.ENDED) {
      // If this track still has repeats left, restart it locally right away
      // instead of waiting on the server round trip — trackEnded() then
      // updates playbackState (and decrements the count) for everyone else.
      const repeatsLeft = stateRef.current?.currentTrack?.repeatCount ?? 1;
      if (repeatsLeft > 1) {
        playerRef.current.seekTo(0, true);
        playerRef.current.playVideo();
      }
      actions.trackEnded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load whatever track the server says is current — applies to everyone,
  // host included, since the host also needs the new video loaded when the
  // queue auto-advances.
  useEffect(() => {
    const player = playerRef.current;
    const track = state?.currentTrack;
    if (!player || !player.loadVideoById) return;

    if (!track) {
      loadedTrackIdRef.current = null;
      player.stopVideo?.();
      return;
    }

    if (loadedTrackIdRef.current === track.trackId) return;
    loadedTrackIdRef.current = track.trackId;

    const { isPlaying, timestamp, updatedAt } = state.playbackState;
    const startSeconds = isPlaying ? timestamp + (Date.now() - updatedAt) / 1000 : timestamp;

    if (isPlaying) {
      player.loadVideoById({ videoId: track.trackId, startSeconds });
    } else {
      player.cueVideoById({ videoId: track.trackId, startSeconds });
    }
  }, [state?.currentTrack?.trackId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Followers stay in sync with the host's playback state. The host is the
  // source of truth for their own player, so they skip this entirely.
  useEffect(() => {
    if (isHost) return;
    const player = playerRef.current;
    if (!player || !state?.currentTrack || !player.seekTo) return;

    const { isPlaying, timestamp, updatedAt } = state.playbackState;
    const expected = isPlaying ? timestamp + (Date.now() - updatedAt) / 1000 : timestamp;

    player.seekTo(expected, true);
    if (isPlaying) player.playVideo();
    else player.pauseVideo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, state?.playbackState?.isPlaying, state?.playbackState?.timestamp, state?.playbackState?.updatedAt]);

  // Periodic drift correction for followers while a track is playing.
  useEffect(() => {
    if (isHost || !state?.playbackState?.isPlaying) return;
    const id = setInterval(() => {
      const player = playerRef.current;
      if (!player || !player.getCurrentTime) return;
      const { timestamp, updatedAt } = state.playbackState;
      const expected = timestamp + (Date.now() - updatedAt) / 1000;
      const drift = Math.abs(player.getCurrentTime() - expected);
      if (drift > 1.5) player.seekTo(expected, true);
    }, 4000);
    return () => clearInterval(id);
  }, [isHost, state?.playbackState]);

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Mute is purely local — it only silences this listener's own player and
  // never touches playback state, so it doesn't sync and doesn't pause.
  function handleToggleMute() {
    const player = playerRef.current;
    if (!player) return;
    if (muted) {
      player.unMute();
      setMuted(false);
    } else {
      player.mute();
      setMuted(true);
    }
  }

  // The host pressing Play is a real click, so it doubles as the gesture
  // that unlocks audio for this tab — no reason to make them click twice.
  function handleHostPlay() {
    if (muted) handleToggleMute();
    playerRef.current?.playVideo();
  }

  function handleHostPause() {
    playerRef.current?.pauseVideo();
  }

  function handleSeekBy(deltaSeconds) {
    const player = playerRef.current;
    if (!player || !player.getCurrentTime) return;
    const target = Math.max(0, player.getCurrentTime() + deltaSeconds);
    const clamped = duration ? Math.min(target, duration) : target;
    player.seekTo(clamped, true);
    actions.seek(clamped);
  }

  // Best-effort background playback support. Neither of these can force a
  // phone's OS to keep a browser tab alive — that's outside what any
  // website's JS can control — they just make it as usable as the platform
  // allows: Wake Lock stops the screen from auto-locking from inactivity
  // while a track is actively playing, and Media Session gives proper
  // lock-screen/notification controls for whenever playback does continue
  // (mainly Android Chrome; iOS Safari suspends background tabs regardless).
  useWakeLock(!!state?.playbackState?.isPlaying);
  useMediaSession({
    track: state?.currentTrack,
    isPlaying: !!state?.playbackState?.isPlaying,
    isHost,
    onPlay: handleHostPlay,
    onPause: handleHostPause,
    onNext: actions.nextSong,
    onToggleMute: handleToggleMute,
  });

  if (status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <p className="font-heading text-lg text-tapri-brown">Couldn't find that room.</p>
        <p className="mt-2 text-sm text-tapri-brown-light">{error}</p>
        <a href="/" className="tapri-btn mt-6 rounded-lg bg-tapri-mustard px-4 py-2 font-heading text-sm font-semibold text-tapri-brown">
          Back home
        </a>
      </div>
    );
  }

  if (status !== "joined" || !state) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="font-chalk text-lg text-tapri-brown-light">Brewing your connection…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:px-8">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-2xl font-bold text-tapri-brown">
          music<span className="text-tapri-terracotta">Adda</span> <span className="text-lg">☕</span>
        </h1>
        <button
          onClick={handleCopyLink}
          className="tapri-btn rounded-full bg-tapri-mustard px-4 py-1.5 font-heading text-sm font-semibold text-tapri-brown hover:bg-tapri-mustard-dark"
        >
          {copied ? "Link copied!" : `Room #${roomId} · Copy link`}
        </button>
      </header>

      <main className="mx-auto mt-6 grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="min-w-0 space-y-4">
          <div className="relative">
            <YoutubePlayer onPlayerReady={handlePlayerReady} onStateChange={handleStateChange} />
            <ReactionOverlay />
          </div>
          <ReactionPicker onReact={actions.sendReaction} />
          <NowPlayingBar
            currentTrack={state.currentTrack}
            playbackState={state.playbackState}
            duration={duration}
            isHost={isHost}
            muted={muted}
            onPlay={handleHostPlay}
            onPause={handleHostPause}
            onSeekCommit={(value) => {
              playerRef.current?.seekTo(value, true);
              actions.seek(value);
            }}
            onSeekBy={handleSeekBy}
            onNext={actions.nextSong}
            onToggleMute={handleToggleMute}
            onIncrementRepeat={actions.incrementRepeat}
          />

          <div>
            <h2 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-tapri-brown-light">
              Add to Queue
            </h2>
            <AddTrackForm onAdd={actions.addToQueue} />
          </div>

          <div>
            <h2 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-tapri-brown-light">
              Up Next ({state.queue.length}) <span className="normal-case text-tapri-brown-light/70">· upvote to bump it up</span>
            </h2>
            <QueueList
              queue={state.queue}
              clientId={clientId}
              onRemove={actions.removeFromQueue}
              onVote={actions.voteForTrack}
              onIncrementRepeat={actions.incrementRepeat}
            />
          </div>
        </section>

        <aside className="min-w-0 space-y-6">
          <div>
            <h2 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-tapri-brown-light">
              In the Adda ({state.users.length})
            </h2>
            <UserList users={state.users} clientId={clientId} isHost={isHost} onMakeHost={actions.makeHost} />
          </div>

          <div>
            <h2 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-tapri-brown-light">
              Adda Chat
            </h2>
            <ChatPanel messages={chatMessages} clientId={clientId} onSend={actions.sendMessage} />
          </div>

          <div>
            <h2 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-tapri-brown-light">
              Played Earlier
            </h2>
            <HistoryPanel
              history={state.history}
              isHost={isHost}
              onReplayNow={actions.replayNow}
              onQueue={actions.queueFromHistory}
            />
          </div>
        </aside>
      </main>
    </div>
  );
}
