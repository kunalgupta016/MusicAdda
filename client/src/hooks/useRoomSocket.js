import { useEffect, useRef, useState, useCallback } from "react";
import { socket } from "../lib/socket";
import { getClientId } from "../lib/identity";
import { requestNotificationPermission, notifyChatMessage } from "../lib/notify";

const DEFAULT_TITLE = "GrooveSync ☕";

// Owns the socket connection + shared room state for a room page.
// Server broadcasts the *entire* room state on every change, so the client
// just replaces its local copy each time — no incremental merge logic needed.
export function useRoomSocket(roomId, name) {
  const clientId = useRef(getClientId()).current;
  const [state, setState] = useState(null);
  const [status, setStatus] = useState("connecting"); // connecting | joined | error
  const [error, setError] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!roomId || !name) return;

    let cancelled = false;
    requestNotificationPermission();
    if (!socket.connected) socket.connect();

    function join() {
      socket.emit("join-room", { roomId, clientId, name }, (res) => {
        if (cancelled) return;
        if (res?.ok) {
          setState(res.state);
          setChatMessages(res.chatHistory ?? []);
          setStatus("joined");
        } else {
          setError(res?.error || "Failed to join room");
          setStatus("error");
        }
      });
    }

    function onSyncState(nextState) {
      if (!cancelled) setState(nextState);
    }

    // A "notification" here means: you weren't looking at this tab when the
    // message arrived. document.hidden is true whenever the tab is in the
    // background or the window is minimized — that's the signal, not
    // whether the chat panel specifically is scrolled into view.
    function onChatMessage(message) {
      if (cancelled) return;
      setChatMessages((prev) => [...prev, message]);
      if (message.clientId !== clientId && document.hidden) {
        setUnreadCount((prev) => prev + 1);
        notifyChatMessage(message);
      }
    }

    socket.on("connect", join);
    socket.on("sync-state", onSyncState);
    socket.on("chat-message", onChatMessage);

    if (socket.connected) join();

    return () => {
      cancelled = true;
      socket.off("connect", join);
      socket.off("sync-state", onSyncState);
      socket.off("chat-message", onChatMessage);
    };
  }, [roomId, name, clientId]);

  // Clear unread state the moment the tab comes back into view.
  useEffect(() => {
    function handleVisibilityChange() {
      if (!document.hidden) setUnreadCount(0);
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount}) ${DEFAULT_TITLE}` : DEFAULT_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [unreadCount]);

  const addToQueue = useCallback((url) => {
    return new Promise((resolve) => socket.emit("add-to-queue", { url }, resolve));
  }, []);

  const removeFromQueue = useCallback((itemId) => {
    socket.emit("remove-from-queue", { itemId });
  }, []);

  const voteForTrack = useCallback((itemId) => {
    socket.emit("vote-queue-item", { itemId });
  }, []);

  const replayTrack = useCallback((historyItemId) => {
    socket.emit("replay-track", { historyItemId });
  }, []);

  const nextSong = useCallback(() => {
    socket.emit("next-song", {});
  }, []);

  const play = useCallback((timestamp) => {
    socket.emit("play", { timestamp });
  }, []);

  const pause = useCallback((timestamp) => {
    socket.emit("pause", { timestamp });
  }, []);

  const seek = useCallback((timestamp) => {
    socket.emit("seek", { timestamp });
  }, []);

  const transferControl = useCallback((targetClientId) => {
    socket.emit("transfer-control", { targetClientId });
  }, []);

  const sendMessage = useCallback((text) => {
    return new Promise((resolve) => socket.emit("chat-message", { text }, resolve));
  }, []);

  const sendReaction = useCallback((emoji) => {
    socket.emit("reaction", { emoji });
  }, []);

  const isHost = state?.hostClientId === clientId;

  return {
    clientId,
    state,
    status,
    error,
    isHost,
    chatMessages,
    unreadCount,
    actions: {
      addToQueue,
      removeFromQueue,
      voteForTrack,
      replayTrack,
      nextSong,
      play,
      pause,
      seek,
      transferControl,
      sendMessage,
      sendReaction,
    },
  };
}
