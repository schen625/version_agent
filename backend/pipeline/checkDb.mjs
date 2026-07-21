// backend/pipeline/checkDb.mjs
//
// Answers: "Is the pipeline completed, and does MongoDB have the required stats?"
// Connects to your real MONGO_URI and reports, across all sessions:
//   • how many have a questionBank / pipelineStats,
//   • the per-condition pool sizes,
//   • a sample generated question,
//   • plus a WordStat (error/frequency) summary.
//
// Read-only. Run from backend/:  node pipeline/checkDb.mjs

import "dotenv/config";
import mongoose from "mongoose";
import Session from "../models/Session.js";
import WordStat from "../models/WordStat.js";

if (!process.env.MONGO_URI) { console.error("MONGO_URI is not set."); process.exit(1); }

const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
console.log(`Connected to ${mongoose.connection.name}\n`);

const total = await Session.countDocuments();
const ended = await Session.countDocuments({ endedAt: { $ne: null } });
const withBank = await Session.countDocuments({ "questionBank.generatedAt": { $ne: null } });
const withStats = await Session.countDocuments({ pipelineStats: { $ne: null } });

console.log("=== SESSIONS ===");
console.log(`total: ${total} | ended: ${ended}`);
console.log(`with questionBank : ${withBank}/${ended} ended (${pct(withBank, ended)}%)`);
console.log(`with pipelineStats: ${withStats}/${ended} ended (${pct(withStats, ended)}%)`);

if (withBank === 0) {
  console.log("\n⚠  No session has pipeline output yet. The pipeline hasn't run on any");
  console.log("   ended session. Populate it by ending a session with the updated");
  console.log("   server running, or run:  node pipeline/runLive.mjs --latest --save\n");
} else {
  // Aggregate pool sizes + flag empty pools.
  const banked = await Session.find({ "questionBank.generatedAt": { $ne: null } })
    .select("_id title questionBank pipelineStats").lean();
  let empties = 0;
  const sums = { ic: 0, of: 0, ou: 0 };
  for (const s of banked) {
    const b = s.questionBank || {};
    const ic = (b.inContextUnfamiliar || []).length;
    const of = (b.outOfContextFamiliar || []).length;
    const ou = (b.outOfContextUnfamiliar || []).length;
    sums.ic += ic; sums.of += of; sums.ou += ou;
    if (ic + of + ou === 0) empties++;
  }
  console.log("\n=== QUESTION BANK (totals across banked sessions) ===");
  console.log(`in_context_unfamiliar : ${sums.ic}`);
  console.log(`out_of_context_familiar : ${sums.of}`);
  console.log(`out_of_context_unfamiliar: ${sums.ou}`);
  if (empties) console.log(`⚠  ${empties} banked session(s) have EMPTY pools (check pipelineStats/logs).`);

  const latest = banked[banked.length - 1];
  const st = latest.pipelineStats || {};
  console.log(`\n=== SAMPLE (session ${latest._id} "${latest.title || ""}") ===`);
  console.log("pipelineStats:", JSON.stringify({
    wordsExtracted: st.wordsExtracted, accepted: st.totalAccepted ?? st.accepted,
    dropped: st.dropped, revisions: st.revisions, llmCalls: st.llmCalls,
    poolSizes: st.poolSizes,
  }));
  const q = (latest.questionBank.inContextUnfamiliar || [])[0] ||
            (latest.questionBank.outOfContextUnfamiliar || [])[0];
  if (q) console.log(`sample question: ${q.cloze}  (answer: ${q.answer})  → ${q.sentenceTranslation}`);
}

const ws = await WordStat.countDocuments();
const wsWithAttempts = await WordStat.countDocuments({ attempts: { $gte: 1 } });
console.log("\n=== WORD STATS (error/frequency tracking) ===");
console.log(`documents: ${ws} | with >=1 attempt: ${wsWithAttempts}`);

await mongoose.disconnect();
console.log("\nDone.");
