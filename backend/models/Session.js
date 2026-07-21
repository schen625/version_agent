import mongoose from "mongoose";

// One generated fill-in-the-blank question in the Assessment question bank.
const bankQuestionSchema = new mongoose.Schema(
  {
    word: String, // target word (empty for out-of-context unfamiliar)
    wordTranslation: String, // the word's meaning in the known language
    condition: String, // in_context_unfamiliar | out_of_context_familiar | out_of_context_unfamiliar
    sentence: String, // full sentence in the learning language
    answer: String, // the word blanked out (== word for familiar conditions)
    sentenceTranslation: String, // sentence translation in the known language
    cloze: String, // sentence with the answer replaced by a blank
    retries: { type: Number, default: 0 }, // revision attempts before acceptance
  },
  { _id: false }
);

const sessionSchema = new mongoose.Schema({
  userId: String,
  mode: String,
  // The target language being practiced (translateTo, e.g. "zh"). Persisted so
  // Review can scope to same-language sessions and old words from a different
  // language don't leak in. Sessions created before this field rely on a
  // script-detection fallback in the frontend (see learnReview.sessionLangKey).
  language: String,
  title: String,
  summary: String,
  vocab: [
    {
      word: String,
      sentence: String,
    },
  ],
  sentences: [
    {
      sentence: String,
      translation: String,
    },
  ],
  createdAt: { type: Date, default: Date.now },
  endedAt: Date,

  messages: [
    {
      role: String,
      original: String,
      translated: String,
      timestamp: { type: Date, default: Date.now },
    },
  ],

  // Pipeline output (added for the question-generation pipeline)
  // The Assessment reads these condition-scoped pools; Learn is unaffected and
  // still uses `vocab` / `sentences` above. Populated asynchronously after a
  // session ends, so end-session returns immediately.
  questionBank: {
    generatedAt: Date,
    inContextUnfamiliar: [bankQuestionSchema],
    outOfContextFamiliar: [bankQuestionSchema],
    outOfContextUnfamiliar: [bankQuestionSchema],
  },
  // Run statistics for auditing the pipeline (counts, retries, timings...).
  pipelineStats: { type: mongoose.Schema.Types.Mixed },
});

// Avoid OverwriteModelError if this module is imported more than once.
export default mongoose.models.Session || mongoose.model("Session", sessionSchema);
