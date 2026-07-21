// backend/pipeline/persist.js
//
// PURE mappers from a runPipeline() result to the shapes persisted on a Session
// document (questionBank + pipelineStats). Kept pure + side-effect free so they
// are directly unit-testable without a database (see verify_persistence.mjs).

const pickQuestion = (q) => ({
  word: q.word ?? "",
  wordTranslation: q.wordTranslation ?? "",
  condition: q.condition ?? "",
  sentence: q.sentence ?? "",
  answer: q.answer ?? "",
  sentenceTranslation: q.sentenceTranslation ?? "",
  cloze: q.cloze ?? "",
  retries: typeof q.retries === "number" ? q.retries : 0,
});

// The bank the Assessment reads from. Three condition-scoped pools:
//   inContextUnfamiliar   -> "in context unfamiliar" (learned words, new sentences)
//   outOfContextFamiliar  -> "out of context familiar" (learned words, generic)
//   outOfContextUnfamiliar-> "out of context unfamiliar" (new words, generic)
// ("in context familiar" reuses the Learn sentences and needs no bank.)
export const buildQuestionBank = (result = {}) => ({
  generatedAt: new Date(),
  inContextUnfamiliar: (result.inContext || []).map(pickQuestion),
  outOfContextFamiliar: (result.outOfContextFamiliar || []).map(pickQuestion),
  outOfContextUnfamiliar: (result.outOfContextUnfamiliar || []).map(pickQuestion),
});

// The run stats persisted for auditing ("mongoDB has the required stats").
export const buildPipelineStats = (result = {}) => {
  const s = result.stats || {};
  return {
    ...s,
    poolSizes: {
      inContextUnfamiliar: (result.inContext || []).length,
      outOfContextFamiliar: (result.outOfContextFamiliar || []).length,
      outOfContextUnfamiliar: (result.outOfContextUnfamiliar || []).length,
    },
  };
};

// Convenience: the exact $set object used to persist a run onto a Session.
export const buildSessionUpdate = (result = {}) => ({
  questionBank: buildQuestionBank(result),
  pipelineStats: buildPipelineStats(result),
});

export default buildSessionUpdate;
