import client from "../../geminiClient.js";

export default async function generateOutContextUnfamiliar(vocabItem) {
  const prompt = `
Generate 10 beginner fill-in-the-blank questions.

RULES:
- Do NOT use conversation history
- Use a DIFFERENT context from casual conversation
- Examples:
  shopping, airport, weather, work, school, travel
- Beginner friendly
- Use "${vocabItem.word}" as answer

Return ONLY JSON:

{
  "questions": [
    {
      "question": "",
      "answer": "${vocabItem.word}"
    }
  ]
}
`;

  const res = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{
      role: "user",
      parts: [{ text: prompt }]
    }]
  });

  let text = res.text.trim();
  text = text.replace(/```json/g, "").replace(/```/g, "").trim();

  return (JSON.parse(text).questions || []).map(q => ({
  ...q,
  condition: "out_of_context_unfamiliar"
}));
}