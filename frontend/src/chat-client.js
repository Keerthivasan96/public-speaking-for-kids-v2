// frontend/src/chat-client.js
// Frontend → Backend → Gemini (via your backend v2)

const BASE_URL = "https://public-speaking-for-kids-backend-v2.vercel.app";

// Helper: call backend generate endpoint
async function callBackendGenerate(prompt) {
  const resp = await fetch(`${BASE_URL}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });

  // If backend returns a non-JSON or error, handle gracefully
  let json;
  try {
    json = await resp.json();
  } catch (err) {
    console.error("Invalid JSON from backend:", err);
    throw new Error("Invalid response from server");
  }

  return json;
}

// Exported function your UI uses
export async function postChat(userText) {
  try {
    const result = await callBackendGenerate(userText);
    console.log("📥 Backend RAW:", result);

    if (!result || result.ok !== true) {
      return { ok: false, reply: "Hmm… something went wrong. Try again!" };
    }

    return { ok: true, reply: String(result.reply) };
  } catch (err) {
    console.error("Chat error:", err);
    return { ok: false, reply: "Oops! Network error. Try again!" };
  }
}
