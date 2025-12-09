const BASE = "http://localhost:4000";

export async function postChat(prompt) {
  const r = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Chat error");
  return j.reply;
}

// placeholder for future TTS endpoint if you add it
export async function postTTS(text) {
  const r = await fetch(`${BASE}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) throw new Error("TTS request failed");
  const blob = await r.blob();
  return blob;
}
