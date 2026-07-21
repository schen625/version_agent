// backend/pipeline/sessionRunner.js
//
// Glue between a Session document and the pure orchestrator: builds the
// conversation transcript, infers the language pair, runs the pipeline, and maps
// the result to the persisted { questionBank, pipelineStats } shape. Networking
// (Gemini) is injected via `llm` so this is still testable with a mock.

import { runPipeline, createConsoleLogger } from "./orchestrator.js";
import { buildQuestionBank, buildPipelineStats } from "./persist.js";

// Turn a session's messages into a plain transcript the extractor reads.
export const conversationFromSession = (session = {}) =>
  (session.messages || [])
    .filter((m) => m && m.original)
    .map((m) => `${m.role || "user"}: ${m.original}`)
    .join("\n");

// This app practices English <-> Chinese. `language` stores the target
// (translateTo). The known language is simply the other one.
const inferKnown = (learning) => (String(learning).toLowerCase() === "en" ? "zh" : "en");

export async function runPipelineForSession({
  session,
  llm,
  logger = createConsoleLogger(),
  options = {},
} = {}) {
  const conversation = conversationFromSession(session);
  const learningLanguage = session?.language || options.learningLanguage || "zh";
  const knownLanguage = options.knownLanguage || inferKnown(learningLanguage);

  // Prefer the words the user actually LEARNED this session (session.vocab) so
  // the bank's in-context + out-of-context-familiar questions target the same
  // words the Assessment expects. Fall back to Stage-1 extraction if none.
  const learnedWords = (session?.vocab || [])
    .filter((v) => v && v.word)
    .map((v) => ({ word: v.word, translation: v.translation }));

  const result = await runPipeline({
    conversation,
    learningLanguage,
    knownLanguage,
    words: learnedWords.length ? learnedWords : options.words || null,
    // Learn sentences the user already studied ("in context FAMILIAR"). The
    // pipeline must never emit one of these for the unfamiliar conditions.
    avoidSentences:
      options.avoidSentences ??
      (session?.sentences || []).map((s) => s?.sentence).filter(Boolean),
    wordCount: options.wordCount ?? Number(process.env.PIPELINE_X ?? 4),
    questionsPerWord: options.questionsPerWord ?? Number(process.env.PIPELINE_Y ?? 3),
    oocFamiliarPerWord: options.oocFamiliarPerWord ?? Number(process.env.PIPELINE_OOC_FAM ?? 3),
    oocUnfamiliarCount: options.oocUnfamiliarCount ?? Number(process.env.PIPELINE_OOC_UNFAM ?? 6),
    maxRetries: options.maxRetries ?? Number(process.env.PIPELINE_MAX_RETRIES ?? 3),
    llm,
    logger,
  });

  return {
    result,
    questionBank: buildQuestionBank(result),
    pipelineStats: buildPipelineStats(result),
  };
}

export default runPipelineForSession;
