// backend/pipeline/index.js
//
// Question-generation pipeline — PROMPT + PARSING layer (Task: "Fix Prompts").
//
// This module splits the old single fused summary prompt into four separated,
// individually engineered stages that share one set of acceptance criteria.
// It is intentionally side-effect free: prompt builders + parsers only. The
// orchestrator that wires these to the LLM client and runs the 3x retry loop is
// the next pipeline task; these pieces are designed to drop straight into it.
//
// Intended flow:
//
//   conversation
//     └─(1) vocabExtractionPrompt ─► parseModelJson ─► normalizeVocab ─► X words
//            for each word:
//     └─(2) contextQuestionPrompt ─► parseModelJson ─► normalizeQuestions ─► Y candidates
//            for each candidate:
//     └─ structuralCheck ─► (3) questionFilterPrompt ─► normalizeFilterVerdict
//            if rejected: questionRevisionPrompt ─► re-filter, up to 3 tries, else DROP
//     └─► accepted in-context question pool
//
//   Out-of-context (feeds the Assessment's out-of-context fill-in-the-blanks):
//     └─(4) outOfContextQuestionPrompt ─► normalizeQuestions
//            ─► structuralCheck ─► questionFilterPrompt(mode:"out_of_context")
//     └─► accepted out-of-context question pool
//
// Example (pseudo — the LLM call belongs to the orchestrator):
//
//   import { vocabExtractionPrompt, parseModelJson, normalizeVocab } from "./pipeline/index.js";
//   const prompt = vocabExtractionPrompt({ conversation, count: 4, learningLanguage: "zh", knownLanguage: "en" });
//   const raw = await llm(prompt);               // orchestrator owns this
//   const words = normalizeVocab(parseModelJson(raw), 4);

export * from "./prompts.js";
export * from "./parse.js";
