// backend/pipeline/index.js
//
// Question-generation pipeline. This module exposes:
//   - the PROMPT builders (prompts.js) and PARSERS (parse.js) — pure, testable;
//   - the ORCHESTRATOR (orchestrator.js) — wires those to an injectable LLM and
//     runs the full flow with the 3x retry loop, structured logging, and stats.
//
// Flow:
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
//     └─► accepted out-of-context pools (familiar + unfamiliar)
//
// Example:
//
//   import { runPipeline, createConsoleLogger } from "./pipeline/index.js";
//   const result = await runPipeline({ conversation, llm, logger: createConsoleLogger() });

export * from "./prompts.js";
export * from "./parse.js";
export { runPipeline, createConsoleLogger } from "./orchestrator.js";
export { default } from "./orchestrator.js";
