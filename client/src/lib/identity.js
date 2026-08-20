import { v4 as uuidv4 } from "uuid";

// Scoped to localStorage — persists across reloads, tab closes, and mobile
// browsers reloading a backgrounded tab from scratch (very common: OS
// memory pressure discards the page and reloads it fresh on return).
// sessionStorage would mint a new identity every time that happens, which
// is exactly what caused the same real person to show up in a room's
// listener list many times over.
export function getClientId() {
  let id = localStorage.getItem("musicadda:clientId");
  if (!id) {
    id = uuidv4();
    localStorage.setItem("musicadda:clientId", id);
  }
  return id;
}

export function getSavedName() {
  return localStorage.getItem("musicadda:name") || "";
}

export function saveName(name) {
  localStorage.setItem("musicadda:name", name);
}
