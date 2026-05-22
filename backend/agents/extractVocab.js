import client from "../geminiClient.js";

export default async function extractVocab(messages) {
    const convoText = messages.map(m => `${m.role}: ${m.original}`).join("\n");

    const prompt = `
        You are a language-learning vocabulary word extractor.
        Extract 10 beginner-friendly vocabulary words using the conversation history provided.
        Follow the given rules below.

        RULES:
        - Words chosen must be from the conversation
        - Avoid names/proper nouns
        - Choose more beginner friendly vocabulary
        - Include translation
        - Include sentence from conversation
        - Score usefulness from 1-10

        Return ONLY JSON:
        {
        "vocabulary": [
            {
            "word": "",
            "translation": "",
            "contextSentence": "",
            "difficulty": "beginner",
            "score": ""
            }
        ]
        }
        Conversation:
        ${convoText}
        `;

    const res = await client.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
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