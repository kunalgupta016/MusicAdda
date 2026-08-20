const DEFAULT_SITE_URL = "http://localhost:5173";

export function getSiteUrl() {
  return (import.meta.env.VITE_SITE_URL || window.location.origin || DEFAULT_SITE_URL).replace(/\/+$/, "");
}