// frontend/api/generate.js
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { prompt, temperature, max_tokens } = req.body;
    
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing or invalid prompt" });
    }

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    if (!GEMINI_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

    const requestBody = {
      contents: [{
        parts: [{ text: prompt }]
      }]
    };

    if (temperature !== undefined || max_tokens !== undefined) {
      requestBody.generationConfig = {};
      if (temperature !== undefined) requestBody.generationConfig.temperature = temperature;
      if (max_tokens !== undefined) requestBody.generationConfig.maxOutputTokens = max_tokens;
    }

    console.log("🚀 Calling Gemini API with model:", GEMINI_MODEL);

    const apiResp = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-goog-api-key": `${GEMINI_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    const raw = await apiResp.json();
    console.log("📥 GEMINI RAW RESPONSE:", JSON.stringify(raw, null, 2));

    if (!apiResp.ok) {
      console.error("❌ API Error:", JSON.stringify(raw));
      return res.status(apiResp.status).json({
        error: "Gemini API error",
        details: raw.error?.message || "Unknown error"
      });
    }

    const reply = raw?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply || !reply.trim()) {
      console.error("❌ No text in response:", JSON.stringify(raw));
      return res.status(500).json({
        error: "No text in response",
        responseKeys: Object.keys(raw)
      });
    }

    console.log("✅ Success! Length:", reply.length);
    return res.status(200).json({ reply: reply.trim() });

  } catch (err) {
    console.error("❌ Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}