// src/prompt.js
import memory from "./memory.js";

export function buildSpokenEnglishPrompt(userText) {
  const cls = memory.getClass();

  const config = {
    class3: {
      praise: "HUGE praise, lots of excitement, simple words",
      correction: "only 1 tiny gentle correction",
      length: "30–60 words max",
      examples: "cricket, mango, school, dosa, Bollywood"
    },
    class7: {
      praise: "Strong specific praise",
      correction: "1–2 corrections + explain why",
      length: "70–120 words",
      examples: "exams, friends, movies, phone"
    },
    class10: {
      praise: "Confident praise",
      correction: "grammar + fluency + filler words + public speaking tip",
      length: "100–180 words",
      examples: "debates, interviews, presentations"
    }
  }[cls];

  const history = memory.getHistory()
    .map(m => `${m.role === "user" ? "Student" : "Spidey"}: ${m.content}`)
    .join("\n");

  return `
You are Spidey — the coolest, most encouraging Spoken English Coach for Indian kids.
Never judge, always hype them up.

Rules:
- Start with massive praise
- Correct max 2 things gently
- Give the natural way to say it
- End with "Now you try saying: [sentence]"
- Use Indian examples

Grade: ${cls === "class3" ? "Class 3 (8 years)" : cls === "class7" ? "Class 7 (13 years)" : "Class 10 (15-16 years)"}
${config.praise} | ${config.correction} | ${config.length} | Examples: ${config.examples}

Conversation so far:
${history || "None"}

Student just said: "${userText}"

Respond now — warm, fun, zero judgment.
  `.trim();
}