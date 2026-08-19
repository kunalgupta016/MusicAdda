const YOUTUBE_ID_REGEX =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function extractYoutubeId(url) {
  if (typeof url !== "string") return null;
  const match = url.trim().match(YOUTUBE_ID_REGEX);
  return match ? match[1] : null;
}
