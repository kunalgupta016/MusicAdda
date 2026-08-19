import { v4 as uuidv4 } from "uuid";

// Scoped to sessionStorage (per-tab) so each browser tab acts as its own
// participant — handy for testing sync locally — while surviving a refresh
// within that same tab so a host doesn't lose control on reload.
export function getClientId() {
  let id = sessionStorage.getItem("groovesync:clientId");
  if (!id) {
    id = uuidv4();
    sessionStorage.setItem("groovesync:clientId", id);
  }
  return id;
}

export function getSavedName() {
  return localStorage.getItem("groovesync:name") || "";
}

export function saveName(name) {
  localStorage.setItem("groovesync:name", name);
}
