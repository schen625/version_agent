// backend/pipeline/orchestrator.js
//
// Question-generation pipeline ORCHESTRATOR (Task: "make the pipeline work +
// logs/checks + 3x retry"). This wires the pure prompt builders (prompts.js)
// and parsers (parse.js) to an INJECTABLE llm client and runs the full flow:
//
//   conversation
//     └─(1) extract X vocab words
//     └─ for each word:
//          (2) generate Y in-context candidates
//          for each candidate:
//            (3) structuralCheck -> LLM filter -> if rejected, revise & re-filter
//                up to `maxRetries` (default 3) times, else DROP
//     └─(4) out-of-context questions (familiar + unfamiliar), filtered the same way
//
// The llm client is injected so the pipeline can be (a) driven by Gemini in
// production and the live script, and (b) driven by a scripted MOCK in the
// verification harness — no network, deterministic, fully assertable.
//
//   const result = await runPipeline({ conversation, llm, logger });
//
// `result` = { words, inContext, outOfContextFamiliar, outOfContextUnfamiliar,
//              stats, ok }. Every question object carries its retry count.

import {
  vocabExtractionPrompt,
  contextQuestionPrompt,
  outOfContextQuestionPrompt,
  questionFilterPrompt,
  questionRevisionPrompt,
} from "./prompts.js";
import {
  parseModelJson,
  normalizeVocab,
  normalizeQuestions,
  normalizeFilterVerdict,
  structuralCheck,
  cloze,
  sentenceKey,
  wordKey,
} from "./parse.js";

// ── Logging ──────────────────────────────────────────────────────────────────
// A logger is just a function (entry) => void. `entry` always has { level,
// stage, event, msg } plus event-specific fields. This makes logs both
// human-readable AND machine-checkable (the harness captures entries and
// asserts on events like "question.dropped" or attempt counts).
export const createConsoleLogger = ({ verbose = true } = {}) => (entry) => {
  if (!verbose && entry.level === "debug") return;
  const tag = `[pipeline:${entry.stage || "-"}]`;
  const extra = { ...entry };
  delete extra.level;
  delete extra.stage;
  delete extra.event;
  delete extra.msg;
  const rest = Object.keys(extra).length ? " " + JSON.stringify(extra) : "";
  // eslint-disable-next-line no-console
  console.log(`${tag} ${entry.event}: ${entry.msg || ""}${rest}`);
};

// ── Small helpers ─────────────────────────────────────────────────────────────
const nowMs = () =>
  typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();

// Build a question object from a raw model object while FORCING a known answer
// (used after revision so the answer word can never drift). Recomputes cloze.
const buildQuestion = (parsed, forcedAnswer) => {
  const sentence = typeof parsed?.sentence === "string" ? parsed.sentence.trim() : "";
  const answer =
    forcedAnswer != null
      ? forcedAnswer
      : typeof parsed?.answer === "string"
        ? parsed.answer.trim()
        : "";
  const translation =
    typeof parsed?.translation === "string" ? parsed.translation.trim() : "";
  const { cloze: c, ok } = cloze(sentence, answer);
  return { sentence, answer, translation, cloze: c, valid: Boolean(sentence && answer && ok) };
};

// ── One question through the filter, with the retry loop ──────────────────────
// Runs the cheap deterministic structuralCheck first (saves an LLM call on
// obviously-broken questions), then the LLM filter. On rejection it revises and
// re-evaluates up to `maxRetries` times, then drops. Returns a full audit trail.
async function filterWithRetry({
  question,
  mode, // "in_context" | "out_of_context"
  conversation,
  learningLanguage,
  knownLanguage,
  maxRetries,
  llm,
  logger,
  stats,
  label,
  usedSentenceKeys = null, // Set of sentenceKey()s that are OFF-LIMITS (Learn sentences + already-accepted questions)
}) {
  const ctx = { conversation, learningLanguage, knownLanguage, mode };
  const attempts = [];

  const evaluate = async (q) => {
    // 1) deterministic pre-check
    const structural = structuralCheck(q);
    if (!structural.accept) {
      return { ...structural, source: "structural", checks: structural.checks || [] };
    }
    // 1b) deterministic duplicate check — the sentence must differ from every
    // Learn sentence (otherwise "in context UNFAMILIAR" would show a sentence
    // the learner already studied) and from every question accepted earlier in
    // this run. Revision can fix this (same answer word, different sentence).
    if (usedSentenceKeys && usedSentenceKeys.has(sentenceKey(q.sentence))) {
      stats.blocked.duplicateSentences++;
      return {
        accept: false,
        failed: ["DUPLICATE_SENTENCE"],
        reasons:
          "This exact sentence was already used (either studied in the Learn activity or accepted for another question). Write a clearly different sentence that still contains the same answer word exactly once.",
        source: "dedupe",
        checks: [],
      };
    }
    // 2) LLM criteria filter
    let raw = "";
    try {
      raw = await llm(questionFilterPrompt({ question: q, ...ctx }));
      stats.llmCalls++;
    } catch (err) {
      logger({ level: "warn", stage: "filter", event: "filter.error", msg: String(err?.message || err), label });
      return { accept: false, failed: ["FILTER_ERROR"], reasons: "Filter call threw.", source: "llm", checks: [] };
    }
    const verdict = normalizeFilterVerdict(parseModelJson(raw));
    return { ...verdict, source: "llm" };
  };

  let current = question;
  let verdict = await evaluate(current);
  attempts.push({ attempt: 0, question: current, verdict });
  logger({
    level: "debug",
    stage: "filter",
    event: verdict.accept ? "question.accepted" : "question.rejected",
    msg: label,
    attempt: 0,
    accept: verdict.accept,
    failed: verdict.failed,
    source: verdict.source,
  });

  let attempt = 0;
  while (!verdict.accept && attempt < maxRetries) {
    attempt++;
    stats.revisions++;
    let raw = "";
    try {
      raw = await llm(
        questionRevisionPrompt({
          question: current,
          failed: verdict.failed,
          reasons: verdict.reasons,
          ...ctx,
        })
      );
      stats.llmCalls++;
    } catch (err) {
      logger({ level: "warn", stage: "revise", event: "revise.error", msg: String(err?.message || err), label, attempt });
      break;
    }
    // Force the ORIGINAL answer so revision can never change the tested word.
    current = buildQuestion(parseModelJson(raw), question.answer);
    verdict = await evaluate(current);
    attempts.push({ attempt, question: current, verdict });
    logger({
      level: "debug",
      stage: "revise",
      event: verdict.accept ? "question.revised_accepted" : "question.revised_rejected",
      msg: label,
      attempt,
      accept: verdict.accept,
      failed: verdict.failed,
    });
  }

  const accepted = verdict.accept === true;
  if (accepted) {
    stats.accepted++;
    // Register the accepted sentence so no later question can duplicate it.
    if (usedSentenceKeys) usedSentenceKeys.add(sentenceKey(current.sentence));
  } else {
    stats.dropped++;
    logger({
      level: "info",
      stage: "filter",
      event: "question.dropped",
      msg: `${label} dropped after ${attempt} revision(s)`,
      retries: attempt,
      failed: verdict.failed,
    });
  }

  return { accepted, question: current, retries: attempt, verdict, attempts };
}

// Generate a batch of candidates from a generation prompt, tolerating a bad/empty
// model response (returns []). `promptText` is the already-built prompt string.
// `max` caps the batch at the requested count: every extra candidate would cost
// at least one more filter call, so over-generation is trimmed (and logged).
async function generateCandidates({ promptText, llm, logger, stats, stage, max }) {
  let raw = "";
  try {
    raw = await llm(promptText);
    stats.llmCalls++;
  } catch (err) {
    logger({ level: "warn", stage, event: "generate.error", msg: String(err?.message || err) });
    return [];
  }
  let candidates = normalizeQuestions(parseModelJson(raw));
  if (typeof max === "number" && max >= 0 && candidates.length > max) {
    logger({
      level: "debug",
      stage,
      event: "candidates.truncated",
      msg: `model returned ${candidates.length}, capped to ${max}`,
      from: candidates.length,
      to: max,
    });
    candidates = candidates.slice(0, max);
  }
  logger({ level: "debug", stage, event: "candidates.generated", msg: `${candidates.length} candidate(s)`, count: candidates.length });
  return candidates;
}

// ── Public entry point ────────────────────────────────────────────────────────
export async function runPipeline({
  conversation = "",
  learningLanguage = "zh",
  knownLanguage = "en",
  wordCount = 4, // X
  questionsPerWord = 3, // Y (in-context)
  oocFamiliarPerWord = 3, // out-of-context questions per learned word
  oocUnfamiliarCount = 6, // out-of-context questions with model-picked new words
  maxRetries = 3, // retries before dropping (spec: 3)
  words: providedWords = null, // if provided, skip Stage-1 extraction and use these
  avoidSentences = [], // Learn sentences the user already studied — questions must differ
  llm,
  logger = createConsoleLogger(),
} = {}) {
  if (typeof llm !== "function") {
    throw new Error("runPipeline requires an `llm` function (prompt:string) => Promise<string>.");
  }

  const stats = {
    wordsRequested: wordCount,
    wordsExtracted: 0,
    llmCalls: 0,
    accepted: 0, // accepted questions across ALL stages
    dropped: 0, // dropped questions across ALL stages
    revisions: 0, // total revision attempts across ALL stages
    inContext: { candidates: 0, accepted: 0, dropped: 0 },
    oocFamiliar: { candidates: 0, accepted: 0, dropped: 0 },
    oocUnfamiliar: { candidates: 0, accepted: 0, dropped: 0 },
    // Deterministic condition-integrity blocks (see filterWithRetry / Stage 4b):
    blocked: { duplicateSentences: 0, bannedAnswers: 0, duplicateAnswers: 0 },
    maxRetries,
    startedAt: new Date().toISOString(),
    durationMs: 0,
  };
  const t0 = nowMs();

  // Sentences that questions may NEVER equal: the Learn sentences (the learner
  // already studied them, so reusing one would corrupt the "unfamiliar"
  // conditions) plus, as the run proceeds, every accepted question.
  const usedSentenceKeys = new Set(
    (avoidSentences || []).map(sentenceKey).filter(Boolean)
  );

  logger({ level: "info", stage: "start", event: "pipeline.start", msg: `X=${wordCount} Y=${questionsPerWord} maxRetries=${maxRetries} avoidSentences=${usedSentenceKeys.size}` });

  // ── Stage 1: vocab extraction (skipped if the caller supplies words) ─────────
  let words = [];
  if (Array.isArray(providedWords) && providedWords.length) {
    words = normalizeVocab({ words: providedWords }, wordCount);
    stats.wordsExtracted = words.length;
    stats.wordsProvided = true;
    logger({ level: "info", stage: "extract", event: "words.provided", msg: words.map((w) => w.word).join(", "), count: words.length });
  } else if (!String(conversation).trim()) {
    // No transcript and no provided words: extracting from nothing would only
    // invite hallucinated vocabulary. Skip straight to the OOC-unfamiliar stage.
    logger({ level: "warn", stage: "extract", event: "extract.skipped", msg: "empty conversation — no words to extract" });
  } else {
    try {
      const raw = await llm(
        vocabExtractionPrompt({ conversation, count: wordCount, learningLanguage, knownLanguage })
      );
      stats.llmCalls++;
      words = normalizeVocab(parseModelJson(raw), wordCount);
    } catch (err) {
      logger({ level: "error", stage: "extract", event: "extract.error", msg: String(err?.message || err) });
    }
    stats.wordsExtracted = words.length;
    logger({ level: "info", stage: "extract", event: "words.extracted", msg: words.map((w) => w.word).join(", "), count: words.length });
  }

  const inContext = [];
  const outOfContextFamiliar = [];
  const outOfContextUnfamiliar = [];

  // ── Stage 2 + 3: in-context generation + filter/retry, per word ─────────────
  for (const w of words) {
    const candidates = await generateCandidates({
      promptText: contextQuestionPrompt({
        word: w.word,
        translation: w.translation,
        conversation,
        count: questionsPerWord,
        learningLanguage,
        knownLanguage,
        avoidSentences,
      }),
      llm,
      logger,
      stats,
      stage: "generate",
      max: questionsPerWord,
    });
    stats.inContext.candidates += candidates.length;

    for (let i = 0; i < candidates.length; i++) {
      const res = await filterWithRetry({
        question: candidates[i],
        mode: "in_context",
        conversation,
        learningLanguage,
        knownLanguage,
        maxRetries,
        llm,
        logger,
        stats,
        label: `in_context "${w.word}" #${i + 1}`,
        usedSentenceKeys,
      });
      if (res.accepted) {
        stats.inContext.accepted++;
        inContext.push({
          word: w.word,
          wordTranslation: w.translation,
          condition: "in_context_unfamiliar",
          sentence: res.question.sentence,
          answer: res.question.answer,
          sentenceTranslation: res.question.translation,
          cloze: res.question.cloze,
          retries: res.retries,
        });
      } else {
        stats.inContext.dropped++;
      }
    }
  }

  // ── Stage 4a: out-of-context FAMILIAR (learned words, generic sentences) ─────
  for (const w of words) {
    const candidates = await generateCandidates({
      promptText: outOfContextQuestionPrompt({
        mode: "familiar",
        word: w.word,
        translation: w.translation,
        count: oocFamiliarPerWord,
        learningLanguage,
        knownLanguage,
      }),
      llm,
      logger,
      stats,
      stage: "generate_ooc_familiar",
      max: oocFamiliarPerWord,
    });
    stats.oocFamiliar.candidates += candidates.length;

    for (let i = 0; i < candidates.length; i++) {
      const res = await filterWithRetry({
        question: candidates[i],
        mode: "out_of_context",
        conversation: "",
        learningLanguage,
        knownLanguage,
        maxRetries,
        llm,
        logger,
        stats,
        label: `ooc_familiar "${w.word}" #${i + 1}`,
        usedSentenceKeys,
      });
      if (res.accepted) {
        stats.oocFamiliar.accepted++;
        outOfContextFamiliar.push({
          word: w.word,
          wordTranslation: w.translation,
          condition: "out_of_context_familiar",
          sentence: res.question.sentence,
          answer: res.question.answer,
          sentenceTranslation: res.question.translation,
          cloze: res.question.cloze,
          retries: res.retries,
        });
      } else {
        stats.oocFamiliar.dropped++;
      }
    }
  }

  // ── Stage 4b: out-of-context UNFAMILIAR (model-picked new words) ─────────────
  {
    const candidates = await generateCandidates({
      promptText: outOfContextQuestionPrompt({
        mode: "unfamiliar",
        count: oocUnfamiliarCount,
        learningLanguage,
        knownLanguage,
        avoidWords: words.map((w) => w.word),
      }),
      llm,
      logger,
      stats,
      stage: "generate_ooc_unfamiliar",
      max: oocUnfamiliarCount,
    });
    stats.oocUnfamiliar.candidates += candidates.length;

    // Answer-word constraints for this condition. These are checked ONCE,
    // upfront, and violations are dropped WITHOUT the revision loop: revision
    // is defined to keep the answer word (so the tested word can never drift),
    // which makes an invalid ANSWER unfixable by revision.
    //   BANNED_ANSWER    — the answer is a word the user already studied, so it
    //                      cannot appear in the "unfamiliar" condition;
    //   DUPLICATE_ANSWER — a previously accepted unfamiliar question already
    //                      tests this word (each should test a DIFFERENT word).
    const learnedWordKeys = new Set(words.map((w) => wordKey(w.word)).filter(Boolean));
    const usedAnswerKeys = new Set();

    for (let i = 0; i < candidates.length; i++) {
      const label = `ooc_unfamiliar #${i + 1}`;
      const aKey = wordKey(candidates[i].answer);
      if (aKey && learnedWordKeys.has(aKey)) {
        stats.oocUnfamiliar.dropped++;
        stats.dropped++;
        stats.blocked.bannedAnswers++;
        logger({
          level: "info",
          stage: "filter",
          event: "question.dropped",
          msg: `${label} dropped: answer "${candidates[i].answer}" is a learned word — not allowed in the unfamiliar condition`,
          retries: 0,
          failed: ["BANNED_ANSWER"],
        });
        continue;
      }
      if (aKey && usedAnswerKeys.has(aKey)) {
        stats.oocUnfamiliar.dropped++;
        stats.dropped++;
        stats.blocked.duplicateAnswers++;
        logger({
          level: "info",
          stage: "filter",
          event: "question.dropped",
          msg: `${label} dropped: answer "${candidates[i].answer}" already used by another unfamiliar question`,
          retries: 0,
          failed: ["DUPLICATE_ANSWER"],
        });
        continue;
      }

      const res = await filterWithRetry({
        question: candidates[i],
        mode: "out_of_context",
        conversation: "",
        learningLanguage,
        knownLanguage,
        maxRetries,
        llm,
        logger,
        stats,
        label,
        usedSentenceKeys,
      });
      if (res.accepted) {
        stats.oocUnfamiliar.accepted++;
        if (aKey) usedAnswerKeys.add(aKey);
        outOfContextUnfamiliar.push({
          condition: "out_of_context_unfamiliar",
          sentence: res.question.sentence,
          answer: res.question.answer,
          sentenceTranslation: res.question.translation,
          cloze: res.question.cloze,
          retries: res.retries,
        });
      } else {
        stats.oocUnfamiliar.dropped++;
      }
    }
  }

  stats.durationMs = Math.round(nowMs() - t0);
  stats.finishedAt = new Date().toISOString();
  stats.totalAccepted = inContext.length + outOfContextFamiliar.length + outOfContextUnfamiliar.length;

  logger({
    level: "info",
    stage: "done",
    event: "pipeline.done",
    msg: `accepted ${stats.totalAccepted} (in-context ${inContext.length}, ooc-familiar ${outOfContextFamiliar.length}, ooc-unfamiliar ${outOfContextUnfamiliar.length}); dropped ${stats.dropped}; revisions ${stats.revisions}; blocked dupSent=${stats.blocked.duplicateSentences} bannedAns=${stats.blocked.bannedAnswers} dupAns=${stats.blocked.duplicateAnswers}; llmCalls ${stats.llmCalls}; ${stats.durationMs}ms`,
  });

  return { ok: true, words, inContext, outOfContextFamiliar, outOfContextUnfamiliar, stats };
}

export default runPipeline;
