// backend/pipeline/parse.js
//
// Pure parsing / validation helpers for pipeline model output. No network calls,
// so every function here is directly unit-testable.

const norm = (s) => (typeof s === "string" ? s.trim() : "");

// Strip ```json fences / surrounding prose, then JSON.parse. Returns the parsed
// value, or null if it cannot be parsed. The model is told to return ONLY JSON,
// but this is defensive against the occasional stray prose or code fence.
export const parseModelJson = (text) => {
  if (text == null) return null;
  let t = String(text).trim();
  t = t.replace(/```json/gi, "").replace(/```/g, "").trim();
  // If prose wraps the JSON, slice from the first { or [ to the last } or ].
  if (t[0] !== "{" && t[0] !== "[") {
    const start = t.search(/[{[]/);
    const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (start !== -1 && end !== -1 && end > start) t = t.slice(start, end + 1);
  }
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

// Build a fill-in-the-blank cloze by replacing the FIRST verbatim occurrence of
// `word` with a blank. Works for both space-delimited and CJK scripts (plain
// substring replace, no word-boundary assumption). Returns { cloze, ok }; ok is
// false when the word is absent (the question is unusable as a cloze).
export const cloze = (sentence, word, placeholder = "_____") => {
  const s = norm(sentence);
  const w = norm(word);
  if (!s || !w || !s.includes(w)) return { cloze: s, ok: false };
  return { cloze: s.replace(w, placeholder), ok: true };
};

// Stage 1 output -> deduped, trimmed vocab list, capped to `count` if given.
export const normalizeVocab = (json, count) => {
  const arr = Array.isArray(json?.words)
    ? json.words
    : Array.isArray(json)
      ? json
      : [];
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    const word = norm(v?.word);
    if (!word || seen.has(word)) continue;
    seen.add(word);
    out.push({
      word,
      translation: norm(v?.translation),
      pos: norm(v?.pos),
      reason: norm(v?.reason),
    });
  }
  return typeof count === "number" ? out.slice(0, count) : out;
};

// Stage 2 / 4 output -> usable question objects. Each gets a computed `cloze`
// and a `valid` flag (the answer must actually appear in the sentence).
export const normalizeQuestions = (json) => {
  const arr = Array.isArray(json?.questions)
    ? json.questions
    : Array.isArray(json)
      ? json
      : [];
  return arr.map((q) => {
    const sentence = norm(q?.sentence);
    const answer = norm(q?.answer);
    const { cloze: c, ok } = cloze(sentence, answer);
    return {
      sentence,
      answer,
      translation: norm(q?.translation),
      cloze: c,
      valid: Boolean(sentence && answer && ok),
    };
  });
};

// Stage 3 output -> normalized verdict. Unparseable / missing => reject so the
// pipeline never accepts a question it could not actually review.
export const normalizeFilterVerdict = (json) => {
  if (!json || typeof json !== "object") {
    return {
      accept: false,
      failed: ["UNPARSEABLE"],
      reasons: "Filter returned no parseable verdict.",
    };
  }
  return {
    accept: json.accept === true,
    failed: Array.isArray(json.failed) ? json.failed.map(norm).filter(Boolean) : [],
    reasons: norm(json.reasons),
  };
};

// Cheap, deterministic pre-check run BEFORE the LLM filter. Catches structural
// failures (missing fields, answer not in sentence, absurd length) without
// spending a model call, and feeds the pipeline's logs. Same shape as a filter
// verdict so callers can treat it uniformly.
export const structuralCheck = (q) => {
  const failed = [];
  const sentence = norm(q?.sentence);
  const answer = norm(q?.answer);
  if (!sentence) failed.push("EMPTY_SENTENCE");
  if (!answer) failed.push("EMPTY_ANSWER");
  if (answer && sentence && !sentence.includes(answer)) failed.push("CONTAINS_WORD");
  if (!norm(q?.translation)) failed.push("MISSING_TRANSLATION");
  // Length guard: word-based when spaces exist, char-based for CJK scripts.
  const tooLong = /\s/.test(sentence)
    ? sentence.split(/\s+/).filter(Boolean).length > 20
    : sentence.length > 40;
  if (sentence && tooLong) failed.push("BEGINNER");
  return {
    accept: failed.length === 0,
    failed,
    reasons: failed.length ? "Structural pre-check failed." : "",
  };
};
