import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// Hard cap on characters sent to ElevenLabs per reply, to control credit burn.
// Mirrors the client-side cap; the server enforces it too so a crafted request
// can never bill more than this. Tunable.
const TTS_CHAR_CAP = 2000;

// Low-latency model, as specified.
const TTS_MODEL = "eleven_turbo_v2_5";

/**
 * POST /api/tts
 * Body: { text: string }
 * Returns: audio/mpeg stream from ElevenLabs.
 *
 * The API key lives ONLY here (server-side). On any failure we return a non-2xx
 * status with no audio; the client falls back to text-only and never breaks.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  // No key/voice configured → 503, client stays silent. (Never throws.)
  if (!apiKey || !voiceId) {
    return new Response("TTS not configured", { status: 503 });
  }

  let text = "";
  try {
    const body = (await req.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text : "";
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  text = text.trim();
  if (!text) return new Response("Empty text", { status: 400 });
  if (text.length > TTS_CHAR_CAP) {
    text = text.slice(0, TTS_CHAR_CAP - 1) + "…";
  }

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
        voiceId
      )}/stream?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: TTS_MODEL,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!upstream.ok || !upstream.body) {
      // Swallow the upstream error body (may contain account details); the
      // client only needs to know it failed so it can fall back to text.
      console.error("ElevenLabs TTS failed:", upstream.status);
      return new Response("TTS upstream error", { status: 502 });
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("/api/tts error:", err);
    return new Response("TTS error", { status: 500 });
  }
}
