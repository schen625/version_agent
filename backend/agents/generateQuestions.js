import client from "../geminiClient.js";

export default async function generateQuestions(vocabItem) {

    const prompt = `
        You are generating beginner language learning questions.
        Create 10 unique fill-in-the-blank question.
        Follow the rules below.

        RULES:
        - Similar to conversation context
        - Dont use the exact sentence from conversation history
        - Beginner friendly
        - Natural grammar
        - Short sentence
        - Conversational
        - Use the vocabulary word as answer
        - Sentence should follow the conversation sentences
        - Generated sentences should be similar to sentences used in the conversation

        Vocabulary:
        ${vocabItem.word}

        Original sentence:
        ${vocabItem.contextSentence}

         Return ONLY JSON:
        {
            "questions": [
                {
                "type": "fill_blank",
                "word": "${vocabItem.word}",
                "question": "",
                "answer": "${vocabItem.word}",
                "translation": "",
                "difficulty": "beginner"
                }
            ]
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
    const parsed = JSON.parse(text);
    return parsed.questions || [];
}