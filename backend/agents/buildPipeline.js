import extractVocab from "./extractVocab.js";
import generateQuestions from "./generateQuestions.js";
import questionFilter from "./questionFilter.js";
import regenerateQuestion from "./regenerateQuestion.js";

function shuffle(arr) {
    return [...arr].sort(() => Math.random() - 0.5);
}

async function validateWithRetry(question, vocabItem, retries = 3) {
    let currentQuestion = question;

    for (let i = 0; i < retries; i++) {
        try {
            const validation = await questionFilter(currentQuestion, vocabItem);
            if (validation.approved === true || validation.approved === "true") {
                return {
                    ...currentQuestion,
                    approved: true,
                    validationReason: validation.reason,
                    originalSentence:
                        vocabItem.contextSentence
                };
            }

            currentQuestion =
                await regenerateQuestion(vocabItem, currentQuestion, validation.reason);
        } catch (err) {
            console.error(err);
        }
    }
    return null;
}

async function generateQuestionPool(vocabItem) {
    const candidates = await generateQuestions(vocabItem);

    const validated = await Promise.all(
        candidates.map(q => validateWithRetry(q, vocabItem)));

    return validated.filter(Boolean);
}

export default async function buildPipeline(messages) {
    const vocabResult = await extractVocab(messages);
    const vocabulary = vocabResult.vocabulary.sort((a, b) => b.score - a.score).slice(0, 5);
    const generatedQuestions = await Promise.all(vocabulary.map(async (vocabItem) => {
        const validQuestions = await generateQuestionPool(vocabItem);
        const shuffledQuestions = shuffle(validQuestions);
        const familiar = shuffledQuestions.slice(0, 4).map(q => ({
            word: vocabItem.word,
            question: q.question || q.sentence || q.text || "",
            answer: vocabItem.translation,
            condition: "in_context_familiar"
        }));
        const unfamiliar = shuffledQuestions.slice(4, 8).map(q => ({
            word: vocabItem.word,
            question: q.question || q.sentence || q.text || "",
            answer: vocabItem.translation,
            condition: "in_context_unfamiliar"
        }));
        return {
            word: vocabItem.word, familiar, unfamiliar
        };
    })
    );

    const learnQuestions = generatedQuestions.flatMap(q => q.familiar);
    const testQuestions = generatedQuestions.flatMap(q => q.unfamiliar);
    const questionPool = [
        ...learnQuestions,
        ...testQuestions
    ];
console.log("QUESTION POOL SAMPLE:", questionPool.slice(0, 3));
    return {
        vocabulary, questionPool, learnQuestions, testQuestions
    };
}