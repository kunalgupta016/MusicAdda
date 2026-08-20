// Ask once, at a natural point (joining a room) — calling requestPermission()
// again after the user has already answered is a harmless no-op, it just
// won't re-prompt.
export function requestNotificationPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

// tag: "musicadda-chat" means a burst of messages while you're away
// collapses into one notification instead of stacking up spam.
export function notifyChatMessage(message) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const notification = new Notification(`${message.name} · musicAdda`, {
    body: message.text,
    tag: "musicadda-chat",
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}
