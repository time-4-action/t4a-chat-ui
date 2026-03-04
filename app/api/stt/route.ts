import { auth0 } from "@/lib/auth";
import { NextRequest } from "next/server";

// Server-side proxy to Deepgram REST API.
// Avoids all browser WebSocket auth issues — REST worked fine when tested.
export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const audioData = await req.arrayBuffer();
  if (!audioData.byteLength) return new Response("No audio", { status: 400 });

  const res = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-2-general&language=en-US&smart_format=true",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY}`,
        "Content-Type": "audio/webm",
      },
      body: audioData,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("Deepgram STT error:", err);
    return new Response("STT failed", { status: 500 });
  }

  const data = await res.json();
  const transcript: string =
    data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";

  return Response.json({ transcript });
}
