// chat-client.js
// Frontend → Backend → Gemini

const BASE_URL = "https://public-speaking-for-kids-backend-v2.vercel.app";

export async function postChat(userText) {
  try {
    const resp = await fetch(`${BASE_URL}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: userText }),
    });

    const json = await resp.json();
    console.log("📥 Backend RAW:", json);

    if (!json.ok) {
      return {
        ok: false,
        reply: "Hmm… something went wrong. Try again!",
      };
    }

    return {
      ok: true,
      reply: json.reply,
    };
  } catch (err) {
    console.error("Chat error:", err);
    return {
      ok: false,
      reply: "Oops! Network error. Try again!",
    };
  }
}
