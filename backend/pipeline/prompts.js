// backend/pipeline/prompts.js
//
// Prompt builders for the question-generation pipeline. Each stage is a PURE
// function returning a prompt string - no network calls - so prompts are easy
// to unit-test and the orchestrator (see ./index.js) owns the LLM client and
// the retry loop.
//
// Pipeline stages:
//   1. vocabExtractionPrompt        conversation -> X vocab words
//   2. contextQuestionPrompt        one word     -> Y in-context fill-in questions
//   3. questionFilterPrompt         one question -> accept / reject + reasons
//   4. outOfContextQuestionPrompt   word / none  -> beginner questions w/o context
//   (+) questionRevisionPrompt      rejected Q   -> minimally rewritten Q (retry)
//
// Generation (2 & 4) and filtering (3) share ONE set of acceptance CRITERIA, so
// the generator aims at exactly what the filter enforces. This is the main
// "prompt fix": the old single summary prompt fused extraction + generation and
// had no filter contract; these prompts split the stages and make the criteria
// explicit and auditable.
//
// Grounding: the design mirrors LingoQ (naver-ai/lingoque-monorepo, data/prompts):
//   - separate generation vs. review prompts with strict JSON contracts;
//   - the filter judges EACH criterion independently and returns a per-criterion
//     verdict (cf. their answerability/exclusivity/fluency/… evaluators);
//   - the revision prompt makes MINIMAL changes targeting only the failed
//     criteria (cf. their regen.txt). We keep a cloze (single target word)
//     format because that is what this app's Fill activity + Assessment use,
//     rather than LingoQ's 3-option multiple-choice stems.

export const LANGUAGE_NAMES = {
  en: "English",
  zh: "Chinese",
};

export const langName = (lang) => {
  if (!lang) return "the target language";
  const key = String(lang).toLowerCase();
  return LANGUAGE_NAMES[key] || lang;
};

// Acceptance criteria shared by generation (stages 2 & 4) and filtering (3).
// `scope: "context"` criteria apply only to in-context questions; `"noContext"`
// only to out-of-context ones. Criteria with no scope always apply. Keeping a
// single source of truth keeps the generator and the filter in lock-step.
export const CRITERIA = [
  {
    id: "CONTAINS_WORD",
    text: "The sentence contains the exact target word once, verbatim, so a single fill-in-the-blank can be made from it.",
  },
  {
    id: "UNAMBIGUOUS_ANSWER",
    text: "Given the sentence's meaning (the learner also sees the translation as a clue), the target word is a natural, correct fit for the blank. It is FINE if other words could also grammatically fit — only fail this if the target word does not fit the meaning, or the sentence is so generic that even WITH the translation the learner could not tell which word is wanted.",
  },
  {
    id: "GRAMMATICAL",
    text: "The sentence is grammatically correct and sounds natural to a native speaker.",
  },
  {
    id: "BEGINNER",
    text: "Vocabulary and grammar are beginner level (CEFR A1 to A2) and the sentence is short (about 4 to 12 words).",
  },
  {
    id: "SELF_CONTAINED",
    text: "The sentence makes sense on its own, with no proper nouns, names, or outside references that would make the answer guessable or culture-specific.",
  },
  {
    id: "ACCURATE_TRANSLATION",
    text: "The translation into the known language is accurate and natural.",
  },
  {
    id: "CONTEXT_VARIATION",
    scope: "context",
    text: "The sentence is a fresh variation inspired by the conversation's topics: clearly related, but NOT copied verbatim from the conversation.",
  },
  {
    id: "NO_CONTEXT",
    scope: "noContext",
    text: "The sentence is generic everyday language and does NOT reference the conversation or any specific prior topic.",
  },
];

// The criteria that apply to a given question mode ("in_context" | "out_of_context").
export const criteriaFor = (mode) => {
  const want = mode === "out_of_context" ? "noContext" : "context";
  return CRITERIA.filter((c) => !c.scope || c.scope === want);
};

const renderCriteria = (mode) =>
  criteriaFor(mode)
    .map((c, i) => `${i + 1}. [${c.id}] ${c.text}`)
    .join("\n");

// Stage 1: Vocabulary extraction:
export const vocabExtractionPrompt = ({
  conversation = "",
  count = 4,
  learningLanguage = "zh",
  knownLanguage = "en",
} = {}) => {
  const L = langName(learningLanguage);
  const K = langName(knownLanguage);
  return `You are a meticulous ${L} language-teaching assistant building vocabulary for a beginner learner whose first language is ${K}.

TASK
Read the conversation transcript below and choose the ${count} most useful vocabulary words to teach this learner. Choose words written in ${L} that ACTUALLY APPEAR in the conversation.

SELECTION CRITERIA
- High utility: everyday, high-frequency words the learner will reuse often.
- Teachable at beginner level (CEFR A1 to A2). Skip rare, technical, or advanced words.
- Prefer the dictionary / base form of a word over an inflected form when it still reads naturally.
- Single words (or one tight, common set phrase). No long phrases or full clauses.
- No proper nouns, names, places, brands, numbers, or filler / interjections.
- Exactly ${count} DISTINCT words. Do not include two words that are only inflections of the same lemma.

OUTPUT
Return ONLY JSON (no markdown, no commentary) in exactly this shape:
{
  "words": [
    { "word": "<word in ${L}>", "translation": "<meaning in ${K}>", "pos": "<part of speech>", "reason": "<8 words or fewer on why it is useful>" }
  ]
}
The "words" array MUST contain exactly ${count} items.

CONVERSATION
${conversation}
`;
};

// Stage 2: Context-based question generation (one word -> Y questions):
export const contextQuestionPrompt = ({
  word,
  translation = "",
  conversation = "",
  count = 3,
  learningLanguage = "zh",
  knownLanguage = "en",
  avoidSentences = [], // sentences the learner already studied (Learn) — must not be reused
} = {}) => {
  const L = langName(learningLanguage);
  const K = langName(knownLanguage);
  const avoid = (avoidSentences || [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
  const avoidBlock = avoid.length
    ? `
ALREADY-STUDIED SENTENCES — DO NOT REUSE
The learner has ALREADY studied the sentences below in the Learn activity. Every sentence you write must be CLEARLY DIFFERENT from ALL of them (not a copy, and not a trivial rewording):
${avoid.map((s, i) => `${i + 1}. ${s}`).join("\n")}
`
    : "";
  return `You are a ${L} language-teaching assistant writing fill-in-the-blank practice for a beginner whose first language is ${K}.

TARGET WORD
"${word}"${translation ? ` (${K}: ${translation})` : ""}

TASK
Write ${count} DIFFERENT fill-in-the-blank questions that practice the target word. Each question is one short ${L} sentence that contains the target word EXACTLY ONCE, inspired by — but NOT copied from — the conversation below.
${avoidBlock}
EACH SENTENCE MUST SATISFY ALL OF THESE CRITERIA:
${renderCriteria("in_context")}

OUTPUT
Return ONLY JSON (no markdown, no commentary) in exactly this shape:
{
  "questions": [
    { "sentence": "<full ${L} sentence containing the target word>", "answer": "${word}", "translation": "<${K} translation of the full sentence>" }
  ]
}
Rules:
- The "questions" array MUST contain exactly ${count} items, each a DIFFERENT sentence.
- "answer" MUST be exactly "${word}" and MUST appear verbatim inside "sentence".
- Write the COMPLETE sentence; do NOT insert the blank yourself. The blank is created later.

CONVERSATION (for inspiration only — do not copy sentences verbatim)
${conversation}
`;
};

// Stage 3: Question filter (accept / reject, one question)
export const questionFilterPrompt = ({
  question,
  conversation = "",
  learningLanguage = "zh",
  knownLanguage = "en",
  mode = "in_context",
} = {}) => {
  const L = langName(learningLanguage);
  const K = langName(knownLanguage);
  const q = question || {};
  const ctxBlock =
    mode === "out_of_context"
      ? ""
      : `\nCONVERSATION (the question should be a variation inspired by this)\n${conversation}\n`;
  const ids = criteriaFor(mode).map((c) => c.id);
  const checksTemplate = ids
    .map((id) => `    { "id": "${id}", "pass": true, "reason": "<why it passes or fails>" }`)
    .join(",\n");
  return `You are a STRICT quality reviewer for beginner ${L} fill-in-the-blank questions (learner's first language: ${K}). Judge ONE question against EACH criterion independently and return a per-criterion verdict.

QUESTION UNDER REVIEW
- sentence: "${q.sentence ?? ""}"
- answer (the word that will be blanked out): "${q.answer ?? ""}"
- translation (${K}): "${q.translation ?? ""}"

CRITERIA — evaluate EACH one on its own:
${renderCriteria(mode)}

HOW TO DECIDE
- Produce one "checks" entry for EVERY criterion id above, in the same order.
- For each, set "pass" true/false and give a specific one-line "reason".
- Only mark a criterion "pass": false when it is CLEARLY violated. Give borderline
  cases the benefit of the doubt and pass them. In particular, do NOT fail a
  question just because other words could theoretically fit the blank — the
  learner has the translation as a clue.
- Set top-level "accept" to true ONLY if every check passes.
- "failed" MUST list exactly the ids whose "pass" is false (empty array if none).

OUTPUT
Return ONLY JSON (no markdown, no commentary) in exactly this shape:
{
  "checks": [
${checksTemplate}
  ],
  "accept": true,
  "failed": [],
  "reasons": "<one or two sentences summarizing the verdict>"
}
${ctxBlock}`;
};

// Stage 4: Out-of-context question generation
// mode "familiar":   practice an ALREADY-LEARNED `word` in generic sentences.
// mode "unfamiliar": teach NEW beginner words the model picks, generic sentences.
export const outOfContextQuestionPrompt = ({
  mode = "familiar",
  word,
  translation = "",
  count = 3,
  learningLanguage = "zh",
  knownLanguage = "en",
  avoidWords = [], // (unfamiliar mode) words the student ALREADY studied — never use as answers
} = {}) => {
  const L = langName(learningLanguage);
  const K = langName(knownLanguage);
  const familiar = mode !== "unfamiliar";
  const avoid = (avoidWords || [])
    .map((w) => (typeof w === "string" ? w.trim() : ""))
    .filter(Boolean)
    .slice(0, 40);
  const avoidBlock =
    !familiar && avoid.length
      ? `

The student has ALREADY studied these words — do NOT use any of them as an answer:
${avoid.join(", ")}`
      : "";
  const target = familiar
    ? `TARGET WORD (already learned by the student)
"${word}"${translation ? ` (${K}: ${translation})` : ""}

Write ${count} sentences that each practice THIS word. The target word must appear EXACTLY ONCE in each sentence.`
    : `NO TARGET WORD IS GIVEN.
For each question, YOU choose a DIFFERENT common beginner ${L} word the student likely has NOT studied, and build a sentence around it (the chosen word must appear EXACTLY ONCE in its sentence).${avoidBlock}`;
  return `You are a ${L} language-teaching assistant writing beginner fill-in-the-blank questions for an assessment. The learner's first language is ${K}.

${target}

IMPORTANT: These are OUT-OF-CONTEXT questions. They must be generic, everyday sentences generated WITHOUT any conversation context. Do not reference any specific prior topic or story.

EACH SENTENCE MUST SATISFY ALL OF THESE CRITERIA:
${renderCriteria("out_of_context")}

OUTPUT
Return ONLY JSON (no markdown, no commentary) in exactly this shape:
{
  "questions": [
    { "sentence": "<full ${L} sentence>", "answer": "<the ${L} word to blank out>", "translation": "<${K} translation of the full sentence>" }
  ]
}
Rules:
- The "questions" array MUST contain exactly ${count} items, each a DIFFERENT sentence.
- "answer" MUST appear verbatim inside its "sentence".
${familiar
      ? `- "answer" MUST be exactly "${word}" in every question.`
      : `- Each "answer" MUST be a DIFFERENT beginner word; append its ${K} meaning to the end of "translation".`}
- Write COMPLETE sentences; do NOT insert the blank yourself.
`;
};

//Revision prompt --> used by the retry loop when a question is rejected
export const questionRevisionPrompt = ({
  question,
  failed = [],
  reasons = "",
  conversation = "",
  mode = "in_context",
  learningLanguage = "zh",
  knownLanguage = "en",
} = {}) => {
  const L = langName(learningLanguage);
  const K = langName(knownLanguage);
  const q = question || {};
  const ctxBlock =
    mode === "out_of_context"
      ? "These are OUT-OF-CONTEXT questions: keep the sentence generic and unrelated to any conversation."
      : `Keep the sentence a variation inspired by this conversation (do not copy it verbatim):\n${conversation}`;
  return `You are a quiz revision assistant. Rewrite ONE beginner ${L} fill-in-the-blank question that FAILED review so it satisfies EVERY criterion. Make MINIMAL changes: fix only what the failed criteria require and KEEP the same answer word.

REJECTED QUESTION
- sentence: "${q.sentence ?? ""}"
- answer (must stay the same): "${q.answer ?? ""}"
- translation (${K}): "${q.translation ?? ""}"

WHY IT FAILED
- failed criteria: ${failed.length ? failed.join(", ") : "(unspecified)"}
- reviewer notes: ${reasons || "(none)"}

REVISION STRATEGY
- Change as little as possible; preserve the original learning intent and, for in-context questions, the topic it was inspired by.
- Address ONLY the failed criteria above; do not "improve" parts that already passed.
- If UNAMBIGUOUS_ANSWER failed, add just enough context to the sentence that the answer word is the natural fit — do not swap the answer.
- If BEGINNER failed, shorten or simplify the vocabulary/grammar without changing the answer.
- If CONTAINS_WORD failed, ensure the exact answer word appears verbatim once.

CRITERIA TO SATISFY
${renderCriteria(mode)}

${ctxBlock}

OUTPUT
Return ONLY JSON (no markdown, no commentary) in exactly this shape:
{ "sentence": "<revised ${L} sentence containing the answer>", "answer": "${q.answer ?? ""}", "translation": "<${K} translation>" }
The "answer" MUST stay "${q.answer ?? ""}" and MUST appear verbatim in the revised "sentence".
`;
};
