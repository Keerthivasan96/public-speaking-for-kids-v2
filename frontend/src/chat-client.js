// chat-client.js
// -----------------------------------------------
// 💡 This replaces the old backend logic (localhost:4000)
// and connects your UI directly to Gemini.
// -----------------------------------------------

import { buildSpokenEnglishPrompt } from "./prompt.js";
import { isCasualChatMode } from "./app.js"; // this variable already exists in your UI

// Your API Key MUST come from Vercel environment variables
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";


// ----------------------------------------------------------
// 🔥 THE HEART OF THE SYSTEM — This replaces your old backend
// ----------------------------------------------------------
async function geminiDirectCall(userText) {

  // 1️⃣ Build prompt depending on mode
  let finalPrompt = "";

  if (isCasualChatMode()) {
    finalPrompt = `
You are **Spidey Teacher** 🕷️✨.
A fun, friendly English teacher for kids.
You ALWAYS reply in a positive, simple, encouraging tone.

Introduce yourself naturally when user first speaks.
Keep answers short, fun, and clear.

User said: "${userText}"
`;
  } else {
    // Practice Mode → Grammar correction
    finalPrompt = buildSpokenEnglishPrompt(userText);
  }

  // 2️⃣ Build Gemini request body
  const body = {
    contents: [
      {
        parts: [{ text: finalPrompt }]
      }
    ]
  };

  // 3️⃣ API Request
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const json = await resp.json();
  console.log("🔍 Gemini RAW:", json);

  // 4️⃣ Extract response safely
  const reply =
    json?.candidates?.[0]?.content?.parts?.[0]?.text ??
    "Sorry, I couldn’t understand that.";

  return reply.trim();
}


// ----------------------------------------------------------
// 🔥 THIS IS THE FUNCTION YOUR ENTIRE UI USES
// ----------------------------------------------------------
export async function postChat(userText) {
  try {
    const reply = await geminiDirectCall(userText);

    return {
      ok: true,
      reply,
    };

  } catch (err) {
    console.error("Gemini Error:", err);
    return {
      ok: false,
      reply: "Oops! Something went wrong. Try again!",
    };
  }
}
