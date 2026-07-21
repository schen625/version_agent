// backend/pipeline/verify_persistence.mjs

//   1. run the pipeline (mock LLM) -> a real result,
//   2. map it with the pure buildSessionUpdate() mapper,
//   3. build a real Mongoose Session document and validateSync() it (this
//      exercises the exact schema the server will persist — no DB needed),
//   4. assert the questionBank pools + pipelineStats round-trip with correct
//      shapes and counts.
//
// Run:  node pipeline/verify_persistence.mjs   (exit 0 = passed)

import Session from "../models/Session.js";
import { runPipeline } from "./index.js";
import { buildSessionUpdate, buildQuestionBank, buildPipelineStats } from "./persist.js";

const mock = async (prompt) => {
  if (prompt.includes("quiz revision assistant")) {
    const a = (prompt.match(/- answer \(must stay the same\): "([^"]*)"/) || [])[1] || "";
    return JSON.stringify({ sentence: "这是" + a, answer: a, translation: "This is " + a });
  }
  if (prompt.includes("STRICT quality reviewer"))
    return JSON.stringify({ checks: [{ id: "GRAMMATICAL", pass: true, reason: "ok" }], accept: true, failed: [] });
  if (prompt.includes("most useful vocabulary"))
    return JSON.stringify({ words: [{ word: "累", translation: "tired", pos: "adj", reason: "common" }] });
  if (prompt.includes("OUT-OF-CONTEXT") && prompt.includes("already learned"))
    return JSON.stringify({ questions: [{ sentence: "他很累。", answer: "累", translation: "He is tired." }] });
  if (prompt.includes("OUT-OF-CONTEXT"))
    return JSON.stringify({ questions: [{ sentence: "猫很小。", answer: "猫", translation: "The cat is small." }] });
  if (prompt.includes("fill-in-the-blank practice"))
    return JSON.stringify({ questions: [{ sentence: "我今天很累。", answer: "累", translation: "I am tired today." }] });
  return "{}";
};

const result = await runPipeline({
  conversation: "user: 我很累", wordCount: 1, questionsPerWord: 1,
  oocFamiliarPerWord: 1, oocUnfamiliarCount: 1, llm: mock, logger: () => {},
});

let failures = 0;
const check = (name, cond, detail = "") => {
  if (!cond) failures++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

console.log("\n=== PERSISTENCE VERIFICATION ===\n");

// (2) pure mappers
const bank = buildQuestionBank(result);
const stats = buildPipelineStats(result);
console.log("[pure mappers]");
check("questionBank has all 3 condition pools",
  Array.isArray(bank.inContextUnfamiliar) && Array.isArray(bank.outOfContextFamiliar) && Array.isArray(bank.outOfContextUnfamiliar));
check("bank pool sizes match pipeline output",
  bank.inContextUnfamiliar.length === result.inContext.length &&
  bank.outOfContextFamiliar.length === result.outOfContextFamiliar.length &&
  bank.outOfContextUnfamiliar.length === result.outOfContextUnfamiliar.length);
check("pipelineStats has poolSizes roll-up", stats.poolSizes && typeof stats.poolSizes.inContextUnfamiliar === "number");
check("stored question keeps cloze + condition + retries",
  bank.inContextUnfamiliar[0] && bank.inContextUnfamiliar[0].cloze.includes("_____") &&
  bank.inContextUnfamiliar[0].condition === "in_context_unfamiliar");

// (3) real Mongoose document validation (no DB connection)
const update = buildSessionUpdate(result);
const doc = new Session({ userId: "u1", mode: "test", language: "zh", messages: [], ...update });
const err = doc.validateSync();
console.log("\n[Mongoose schema validation — the exact shape server.js saves]");
check("Session document validates (validateSync)", !err, err ? err.message : "");
check("questionBank persisted on the document", !!doc.questionBank && !!doc.questionBank.generatedAt);
check("pipelineStats persisted on the document", !!doc.pipelineStats && typeof doc.pipelineStats.llmCalls === "number");
check("nested bank question typed correctly (retries is Number)",
  typeof doc.questionBank.inContextUnfamiliar[0].retries === "number");

// (4) round-trip via toObject (what a .find() would return)
const obj = doc.toObject();
console.log("\n[round-trip shape]");
check("toObject().questionBank.outOfContextFamiliar is an array", Array.isArray(obj.questionBank.outOfContextFamiliar));
check("toObject().pipelineStats.poolSizes present", obj.pipelineStats && obj.pipelineStats.poolSizes);

console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"} ===`);
console.log("Note: a real Atlas save/read is exercised by pipeline/checkDb.mjs against your live DB.\n");
process.exit(failures === 0 ? 0 : 1);
