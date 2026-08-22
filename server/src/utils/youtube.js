import { createLogger } from "./logger.js";

const log = createLogger("youtube");

const YOUTUBE_ID_REGEX =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function extractYoutubeId(url) {
  if (typeof url !== "string") return null;
  const match = url.trim().match(YOUTUBE_ID_REGEX);
  return match ? match[1] : null;
}

// Uses YouTube's public oEmbed endpoint to fetch title/thumbnail without needing an API key.
export async function fetchYoutubeMeta(videoId) {
  // SECURITY: defence-in-depth — validate videoId is exactly 11 alphanumeric chars
  // to prevent SSRF via a crafted value.
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    log.warn(`Invalid videoId rejected: ${videoId}`);
    return { title: "Untitled", thumbnail: "" };
  }

  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`
  )}&format=json`;

  try {
    const res = await fetch(oembedUrl);
    if (!res.ok) throw new Error(`oEmbed request failed: ${res.status}`);
    const data = await res.json();
    return {
      title: data.title ?? "Untitled",
      thumbnail: data.thumbnail_url ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch (err) {
    log.warn(`oEmbed fetch failed for ${videoId}: ${err.message}`);
    return {
      title: "Untitled",
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
}
