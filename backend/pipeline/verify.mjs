// backend/pipeline/verify.mjs
//
// VERIFICATION HARNESS for the question-generation pipeline. Runs the real
// orchestrator against a scripted MOCK LLM (no network) that deliberately
// produces: a clean pass, a fail-then-pass (1 retry), a fail-forever (dropped
// after exactly 3 retries), structural rejections, an ANSWER LEAK (answer word
// twice in one sentence), a DUPLICATE of an already-studied Learn sentence, a
// BANNED answer (learned word in the unfamiliar condition), a DUPLICATE answer,
// and an over-long generation batch. Then it asserts every invariant the spec
// cares about:
//   • a pool of questions is generated (and capped at the requested size)
//   • accepted questions actually satisfy the criteria
//   • rejected questions actually fail the criteria
//   • the retry loop runs up to 3 times, then drops
//   • out-of-context questions are generated AND filtered
//   • condition integrity: no Learn-sentence reuse, no learned/duplicate
//     answers in ooc-unfamiliar, no answer leaks
//   • stats are complete and self-consistent
//
// Run:  node pipeline/verify.mjs      (exit code 0 = all checks passed)

import { runPipeline, structuralCheck, countOccurrences, sentenceKey, wordKey } from "./index.js";

const DROP = "△"; // △ marker: a sentence the mock filter always rejects
const LONG = "我".repeat(45) + "累"; // >40 CJK chars -> structural BEGINNER fail
const LEARN_SENTENCE = "昨天你很累。"; // a sentence the user already studied in Learn

const grab = (prompt, re) => {
  const m = prompt.match(re);
  return m ? m[1] : "";
};

// ── Scripted mock LLM ─────────────────────────────────────────────────────────
function makeMockLLM() {
  let fix = 0; // counter so every revision is a UNIQUE sentence (no accidental dups)
  return async function mock(prompt) {
    // REVISION — keep △ sentences failing; otherwise return a unique clean fix
    // that contains the answer exactly once.
    if (prompt.includes("quiz revision assistant")) {
      const answer = grab(prompt, /- answer \(must stay the same\): "([^"]*)"/);
      const sentence = grab(prompt, /- sentence: "([^"]*)"/);
      if (sentence.includes(DROP)) {
        return JSON.stringify({ sentence: "又是" + DROP + answer, answer, translation: "x" });
      }
      fix++;
      return JSON.stringify({ sentence: `第${fix}次改好${answer}。`, answer, translation: `fixed ${fix} (${answer})` });
    }

    // FILTER — fail △ sentences (criterion UNAMBIGUOUS_ANSWER), else pass all.
    if (prompt.includes("STRICT quality reviewer")) {
      const sentence = grab(prompt, /- sentence: "([^"]*)"/);
      if (sentence.includes(DROP)) {
        return JSON.stringify({
          checks: [{ id: "UNAMBIGUOUS_ANSWER", pass: false, reason: "ambiguous (mock)" }],
          accept: false,
          failed: ["UNAMBIGUOUS_ANSWER"],
          reasons: "mock reject",
        });
      }
      return JSON.stringify({ checks: [{ id: "GRAMMATICAL", pass: true, reason: "ok" }], accept: true, failed: [], reasons: "ok" });
    }

    // EXTRACTION — one word: 累 (tired).
    if (prompt.includes("most useful vocabulary")) {
      return JSON.stringify({ words: [{ word: "累", translation: "tired", pos: "adj", reason: "common" }] });
    }

    // OOC generation.
    if (prompt.includes("OUT-OF-CONTEXT")) {
      if (prompt.includes("already learned by the student")) {
        // familiar: 2 clean sentences with 累
        return JSON.stringify({ questions: [
          { sentence: "他很累。", answer: "累", translation: "He is tired." },
          { sentence: "她好累。", answer: "累", translation: "She is tired." },
        ] });
      }
      // unfamiliar: 2 clean + 1 structural fail (answer not in sentence)
      //             + 1 BANNED answer (the learned word 累)
      //             + 1 DUPLICATE answer (猫 again)
      return JSON.stringify({ questions: [
        { sentence: "猫很小。", answer: "猫", translation: "The cat is small." },
        { sentence: "狗很大。", answer: "狗", translation: "The dog is big." },
        { sentence: "天气不错。", answer: "苹果", translation: "The weather is nice. (apple)" },
        { sentence: "我很累。", answer: "累", translation: "I am tired." },
        { sentence: "小猫在家。", answer: "猫", translation: "The kitten is home." },
      ] });
    }

    // IN-CONTEXT generation — 6 candidates (1 more than requested, to test the
    // cap): clean / too-long(retry) / △(drop) / Learn-duplicate(retry) /
    // answer-leak(retry) / an extra one that must be truncated away.
    if (prompt.includes("fill-in-the-blank practice")) {
      return JSON.stringify({ questions: [
        { sentence: "我今天很累。", answer: "累", translation: "I am very tired today." },
        { sentence: LONG + "。", answer: "累", translation: "too long" },
        { sentence: "这是" + DROP + "累", answer: "累", translation: "bad" },
        { sentence: LEARN_SENTENCE, answer: "累", translation: "You were tired yesterday." },
        { sentence: "很累很累。", answer: "累", translation: "So very tired." },
        { sentence: "多余的累。", answer: "累", translation: "extra — must be capped away" },
      ] });
    }

    return "{}";
  };
}

// ── Run + assert ──────────────────────────────────────────────────────────────
const logs = [];
const result = await runPipeline({
  conversation: "user: 我今天很累\nagent: 你要休息",
  learningLanguage: "zh",
  knownLanguage: "en",
  wordCount: 1,
  questionsPerWord: 5,
  oocFamiliarPerWord: 2,
  oocUnfamiliarCount: 5,
  maxRetries: 3,
  avoidSentences: [LEARN_SENTENCE],
  llm: makeMockLLM(),
  logger: (e) => logs.push(e),
});

let failures = 0;
const check = (name, cond, detail = "") => {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

const ev = (name) => logs.filter((l) => l.event === name);
const allAccepted = [...result.inContext, ...result.outOfContextFamiliar, ...result.outOfContextUnfamiliar];
const s = result.stats;

console.log("\n=== PIPELINE VERIFICATION ===\n");

console.log("[pool generated + capped]");
check("1 word extracted", result.words.length === 1, `got ${result.words.length}`);
check("in-context pool is non-empty", result.inContext.length > 0, `size ${result.inContext.length}`);
check("in-context accepted == 4 (clean + 3 retry-then-pass)", result.inContext.length === 4, `size ${result.inContext.length}`);
check("over-generation capped at requested count (6 -> 5)", s.inContext.candidates === 5, `candidates ${s.inContext.candidates}`);
check("truncation was logged", ev("candidates.truncated").some((e) => e.from === 6 && e.to === 5));

console.log("\n[accepted questions actually satisfy the criteria]");
check("every accepted question passes the deterministic criteria",
  allAccepted.every((q) => structuralCheck({ sentence: q.sentence, answer: q.answer, translation: q.sentenceTranslation }).accept));
check("every accepted question's answer appears in its sentence", allAccepted.every((q) => q.sentence.includes(q.answer)));
const acceptEvents = [...ev("question.accepted"), ...ev("question.revised_accepted")];
check("every accept event reported zero failed criteria", acceptEvents.every((e) => (e.failed || []).length === 0));

console.log("\n[no answer leaks]");
check("every accepted question contains its answer EXACTLY once (cloze can't leak)",
  allAccepted.every((q) => countOccurrences(q.sentence, q.answer) === 1));
check("the leaky candidate (answer twice) was caught and revised", s.blocked !== undefined && result.inContext.some((q) => q.retries >= 1));

console.log("\n[rejected questions actually fail the criteria]");
const dropEvents = ev("question.dropped");
check("exactly 3 questions dropped (△ + banned + duplicate answer)", dropEvents.length === 3, `dropped ${dropEvents.length}`);
check("every dropped question reported >=1 failed criterion", dropEvents.every((e) => (e.failed || []).length >= 1), JSON.stringify(dropEvents.map((e) => e.failed)));

console.log("\n[retry loop runs up to 3 times, then drops]");
const dropAfterRetries = dropEvents.find((e) => (e.failed || []).includes("UNAMBIGUOUS_ANSWER"));
check("the unfixable (△) question was dropped after exactly 3 retries", dropAfterRetries && dropAfterRetries.retries === 3, `retries ${dropAfterRetries && dropAfterRetries.retries}`);
check("no question exceeded maxRetries (3)", allAccepted.every((q) => q.retries <= 3) && dropEvents.every((e) => e.retries <= 3));
check("an in-context question was accepted after exactly 1 retry", result.inContext.some((q) => q.retries === 1));
check("an in-context question was accepted with 0 retries", result.inContext.some((q) => q.retries === 0));

console.log("\n[condition integrity: Learn sentences are never reused]");
const learnKey = sentenceKey(LEARN_SENTENCE);
check("no accepted question equals an already-studied Learn sentence",
  allAccepted.every((q) => sentenceKey(q.sentence) !== learnKey));
check("the Learn-duplicate candidate was rejected via DUPLICATE_SENTENCE then revised",
  s.blocked.duplicateSentences === 1 && logs.some((l) => (l.failed || []).includes("DUPLICATE_SENTENCE")),
  `blocked ${s.blocked.duplicateSentences}`);
check("no two accepted questions share the same sentence",
  new Set(allAccepted.map((q) => sentenceKey(q.sentence))).size === allAccepted.length);

console.log("\n[condition integrity: ooc-unfamiliar answers]");
const unfamAnswers = result.outOfContextUnfamiliar.map((q) => wordKey(q.answer));
check("no unfamiliar answer is a learned word", !unfamAnswers.includes(wordKey("累")));
check("learned-word answer was dropped as BANNED_ANSWER (0 retries)",
  dropEvents.some((e) => (e.failed || []).includes("BANNED_ANSWER") && e.retries === 0) && s.blocked.bannedAnswers === 1);
check("repeated answer was dropped as DUPLICATE_ANSWER (0 retries)",
  dropEvents.some((e) => (e.failed || []).includes("DUPLICATE_ANSWER") && e.retries === 0) && s.blocked.duplicateAnswers === 1);
check("all accepted unfamiliar answers are distinct", new Set(unfamAnswers).size === unfamAnswers.length);

console.log("\n[out-of-context generated AND filtered]");
check("ooc-familiar pool == 2", result.outOfContextFamiliar.length === 2, `size ${result.outOfContextFamiliar.length}`);
check("ooc-unfamiliar pool == 3 (2 clean + 1 structural-fix; 2 dropped)", result.outOfContextUnfamiliar.length === 3, `size ${result.outOfContextUnfamiliar.length}`);
check("ooc-unfamiliar structural-fail was fixed via 1 retry", result.outOfContextUnfamiliar.some((q) => q.answer === "苹果" && q.retries === 1 && q.sentence.includes("苹果")));
check("ooc questions carry a condition tag", result.outOfContextFamiliar.every((q) => q.condition === "out_of_context_familiar"));

console.log("\n[stats complete & self-consistent]");
check("stats.totalAccepted == sum of pools (9)", s.totalAccepted === 9, `got ${s.totalAccepted}`);
check("stats.dropped == 3", s.dropped === 3, `got ${s.dropped}`);
check("stats.revisions == 7", s.revisions === 7, `got ${s.revisions}`);
check("stats accepted+dropped == total candidates across stages",
  s.accepted + s.dropped === s.inContext.candidates + s.oocFamiliar.candidates + s.oocUnfamiliar.candidates,
  `${s.accepted}+${s.dropped} vs ${s.inContext.candidates + s.oocFamiliar.candidates + s.oocUnfamiliar.candidates}`);
check("stats.llmCalls > 0 and durationMs >= 0", s.llmCalls > 0 && s.durationMs >= 0, `llmCalls ${s.llmCalls}`);

console.log("\n[logging]");
check("pipeline.start and pipeline.done both logged", ev("pipeline.start").length === 1 && ev("pipeline.done").length === 1);
check("candidate generation logged for every stage", ev("candidates.generated").length >= 3);

// ── Empty-conversation guard (separate tiny run) ──────────────────────────────
console.log("\n[empty conversation guard]");
{
  const seen = [];
  const logs2 = [];
  const r2 = await runPipeline({
    conversation: "   ",
    oocUnfamiliarCount: 1,
    llm: async (p) => {
      seen.push(p);
      if (p.includes("STRICT quality reviewer")) return JSON.stringify({ checks: [{ id: "GRAMMATICAL", pass: true, reason: "ok" }], accept: true, failed: [] });
      return JSON.stringify({ questions: [{ sentence: "水很好。", answer: "水", translation: "Water is good." }] });
    },
    logger: (e) => logs2.push(e),
  });
  check("extraction is skipped on an empty conversation", logs2.some((e) => e.event === "extract.skipped"));
  check("no extraction prompt was sent to the LLM", !seen.some((p) => p.includes("most useful vocabulary")));
  check("ooc-unfamiliar still runs (assessment pool)", r2.outOfContextUnfamiliar.length === 1);
}

console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"} ===`);
console.log(`Summary: accepted ${s.totalAccepted}, dropped ${s.dropped}, revisions ${s.revisions}, blocked ${JSON.stringify(s.blocked)}, llmCalls ${s.llmCalls}, ${s.durationMs}ms\n`);
process.exit(failures === 0 ? 0 : 1);
