import { useEffect, useRef, useState, useCallback } from "react";
import { socket } from "../lib/socket";
import { getClientId } from "../lib/identity";

// Owns the socket connection + shared room state for a room page.
// Server broadcasts the *entire* room state on every change, so the client
// just replaces its local copy each time — no incremental merge logic needed.
export function useRoomSocket(roomId, name) {
  const clientId = useRef(getClientId()).current;
  const [state, setState] = useState(null);
  const [status, setStatus] = useState("connecting"); // connecting | joined | error
  const [error, setError] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);

  useEffect(() => {
    if (!roomId || !name) return;

    let cancelled = false;
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

    function onChatMessage(message) {
      if (!cancelled) setChatMessages((prev) => [...prev, message]);
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
