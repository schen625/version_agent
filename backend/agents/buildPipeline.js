import extractVocab from "./extractVocab.js";
import generateQuestions from "./generateQuestions.js";
import questionFilter from "./questionFilter.js";
import regenerateQuestion from "./regenerateQuestion.js";
import generateOutContextFamiliar from "./OOC/OOCFamiliar.js";
import generateOutContextUnfamiliar from "./OOC/OOCUnfamiliar.js";

function shuffle(arr) {
    return [...arr].sort(() => Math.random() - 0.5);
}

function createQuestionObject(question, extra = {}) {
    return {
        id: crypto.randomUUID(),
        type: "fill_blank",
        word: question.word,
        question: question.question,
        answer: question.answer,
        translation: question.translation || "",
        difficulty: question.difficulty || "beginner",
        ...extra
    };
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
                    answer: currentQuestion.answer,
                    validationReason: validation.reason,
                    originalSentence:
                        vocabItem.contextSentence
                };
            }

            currentQuestion = await regenerateQuestion(vocabItem, currentQuestion, validation.reason);
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

    const vocabulary = vocabResult.vocabulary
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);
    const inContext = await Promise.all(
        vocabulary.map(async (vocabItem) => {
            const validQuestions =
                await generateQuestionPool(vocabItem);

            return validQuestions.map(q =>
                createQuestionObject(q)
            );
        })
    );

    const allInContext = shuffle(inContext.flat());

    const learnQuestions = allInContext
        .slice(0, 10)
        .map(q => ({ ...q, condition: "in_context_familiar" }));

    const inContextUnfamiliar = allInContext
        .slice(10, 20)
        .map(q => ({ ...q, condition: "in_context_unfamiliar" }));

    //OOC familiar
    const outContextFamiliar = await Promise.all(
        vocabulary.map(v => generateOutContextFamiliar(v))
    );

    const oocFamiliar = outContextFamiliar
        .flat()
        .filter(Boolean)
        .map(q => ({
            ...q,
            word: q.answer,
            condition: "out_of_context_familiar"
        }));

    //OOC unfamiliar
    const outContextUnfamiliar = await Promise.all(
        vocabulary.map(v => generateOutContextUnfamiliar(v))
    );

    const oocUnfamiliar = outContextUnfamiliar
        .flat()
        .filter(Boolean)
        .map(q => ({
            ...q,
            word: q.answer,
            condition: "out_of_context_unfamiliar"
        }));

    const questionPool = [
        ...learnQuestions,
        ...inContextUnfamiliar,
        ...oocFamiliar,
        ...oocUnfamiliar
    ].filter(q =>
        q &&
        q.question &&
        q.word &&
        q.condition
    );

    return {
        vocabulary,
        questionPool,
        learnQuestions,
        testQuestions: questionPool
    };
}