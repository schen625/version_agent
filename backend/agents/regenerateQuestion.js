import client from "../geminiClient.js";

export default async function regenerateQuestion(vocabItem,failedQuestion,failureReason) {

    const prompt = `The previous language-learning question failed review.

    Failure reason:
    ${failureReason}

    Vocabulary word:
    ${vocabItem.word}

    Original conversation sentence:
    ${vocabItem.contextSentence}

    Failed question:
    ${failedQuestion.question}

    Create ONE improved beginner-friendly
    fill-in-the-blank question.

    RULES:
    - Natural grammar
    - Short sentence
    - Conversational
    - Different from original sentence
    - Use the vocab word as answer

    Return ONLY JSON:

    {
      "type": "fill_blank",
      "word": "${vocabItem.word}",
      "question": "",
      "answer": "${vocabItem.word}",
      "translation": "",
      "difficulty": "beginner"
    }
    `;

    const res =
        await client.models.generateContent({
            model: "gemini-3.1-flash-lite-preview",
            contents: [{
                role: "user",
                parts: [{ text: prompt }]
            }]
        });

    let text = res.text.trim();

    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    return JSON.parse(text);
}