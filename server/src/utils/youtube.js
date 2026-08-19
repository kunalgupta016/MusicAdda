const YOUTUBE_ID_REGEX =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function extractYoutubeId(url) {
  if (typeof url !== "string") return null;
  const match = url.trim().match(YOUTUBE_ID_REGEX);
  return match ? match[1] : null;
}

// Uses YouTube's public oEmbed endpoint to fetch title/thumbnail without needing an API key.
export async function fetchYoutubeMeta(videoId) {
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
    return {
      title: "Untitled",
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
}
