import client from "../geminiClient.js";

export default async function questionFilter(question, vocabItem) {

    const prompt = `
        You are a language learning question reviewer/filterer.
        Evaluate this beginner language learning question.

        CHECK:
        1. Grammar correctness
        2. Beginner friendliness
        3. Natural wording
        4. Pedagogical usefulness
        5. Blank clarity
        6. Not too similar to original sentence

        Original sentence:
        ${vocabItem.contextSentence}

        Generated question:
        ${question.question}

        Answer:
        ${question.answer}

        Return ONLY JSON:
        {
        "approved": true,
        "reason": ""
        }
        `;

    const res = await client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
            {
                role: "user",
                parts: [{ text: prompt }]
            }
        ]
    });
    let text = res.text.trim();
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(text);
}