import client from "../../geminiClient.js";

export default async function generateOutContextFamiliar(vocabItem) {
  const prompt = `
Generate 10 beginner language-learning fill-in-the-blank questions.

RULES:
- Do NOT use conversation history
- Use common daily situations
- Beginner friendly
- Natural grammar
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
    model: "gemini-3.1-flash-lite-preview",
    contents: [{
      role: "user",
      parts: [{ text: prompt }]
    }]
  });

  let text = res.text.trim();
  text = text.replace(/```json/g, "").replace(/```/g, "").trim();

  return (JSON.parse(text).questions || []).map(q => ({
  ...q,
  condition: "out_of_context_familiar"
}));
}