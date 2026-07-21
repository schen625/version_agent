// backend/pipeline/runLive.mjs
//
// Run the pipeline LIVE against real Gemini (+ optionally your real MongoDB).
// The sandbox can't reach Atlas or Gemini, so this is the script Pranshul runs
// locally to validate end-to-end and to backfill the question bank.
//
// Usage (from backend/):
//   node pipeline/runLive.mjs --demo                 # built-in convo, no DB
//   node pipeline/runLive.mjs --latest               # latest ended session (read-only)
//   node pipeline/runLive.mjs --latest --save        # ...and persist the bank+stats
//   node pipeline/runLive.mjs --sessionId=<id> --save
//
// Needs API_KEY (Gemini) and, unless --demo, MONGO_URI — both from backend/.env.

import "dotenv/config";
import mongoose from "mongoose";
import Session from "../models/Session.js";
import { createGeminiLLM } from "./geminiClient.js";
import { runPipelineForSession, conversationFromSession } from "./sessionRunner.js";
import { runPipeline, createConsoleLogger } from "./orchestrator.js";
import { buildQuestionBank, buildPipelineStats } from "./persist.js";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (k) => { const a = args.find((x) => x.startsWith(k + "=")); return a ? a.split("=")[1] : null; };

const DEMO = `user: 你好，我今天很累
agent: 为什么累呢？
user: 我工作了很长时间，现在想喝咖啡
agent: 好主意，喝咖啡可以休息一下
user: 对，我也想吃点东西`;

const llm = createGeminiLLM({ apiKey: process.env.API_KEY, apiVersion: "v1alpha" });
const logger = createConsoleLogger({ verbose: true });

async function main() {
  if (has("--demo")) {
    console.log("Running pipeline on a built-in DEMO conversation (no DB)...\n");
    const result = await runPipeline({
      conversation: DEMO, learningLanguage: "zh", knownLanguage: "en", llm, logger,
    });
    printResult(result);
    return;
  }

  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set (needed unless --demo).");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  console.log("MongoDB connected.\n");

  let session;
  const id = val("--sessionId");
  if (id) session = await Session.findById(id);
  else session = await Session.findOne({ endedAt: { $ne: null } }).sort({ endedAt: -1 });
  if (!session) throw new Error("No matching session found (need an ended session, or pass --sessionId=).");

  console.log(`Session ${session._id}  "${session.title || "(untitled)"}"  lang=${session.language || "?"}  messages=${(session.messages || []).length}`);
  console.log(`Learned vocab: ${(session.vocab || []).map((v) => v.word).join(", ") || "(none)"}\n`);
  if (!conversationFromSession(session)) console.warn("WARNING: this session has no message text; extraction may be empty.\n");

  const { result, questionBank, pipelineStats } = await runPipelineForSession({ session, llm, logger });
  printResult(result);

  if (has("--save")) {
    session.questionBank = questionBank;
    session.pipelineStats = pipelineStats;
    await session.save();
    console.log(`\nSaved questionBank + pipelineStats to session ${session._id}.`);
  } else {
    console.log("\n(dry run — pass --save to persist to MongoDB)");
  }
  await mongoose.disconnect();
}

function printResult(result) {
  const s = result.stats;
  const bank = buildQuestionBank(result);
  const stats = buildPipelineStats(result);
  console.log("\n──────── RESULT ────────");
  console.log(`words: ${result.words.map((w) => w.word).join(", ")}`);
  console.log(`in_context_unfamiliar : ${bank.inContextUnfamiliar.length}`);
  console.log(`out_of_context_familiar : ${bank.outOfContextFamiliar.length}`);
  console.log(`out_of_context_unfamiliar: ${bank.outOfContextUnfamiliar.length}`);
  console.log(`accepted ${s.totalAccepted} | dropped ${s.dropped} | revisions ${s.revisions} | llmCalls ${s.llmCalls} | ${s.durationMs}ms`);
  const sample = bank.inContextUnfamiliar[0] || bank.outOfContextUnfamiliar[0];
  if (sample) console.log(`\nsample: ${sample.cloze}  (answer: ${sample.answer})  → ${sample.sentenceTranslation}`);
  console.log("pipelineStats.poolSizes:", JSON.stringify(stats.poolSizes));
}

main().catch((e) => { console.error("\nrunLive ERROR:", e?.message || e); process.exit(1); });
