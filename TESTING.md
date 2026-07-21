# Testing Guide

This project has two groups of tests: **pipeline verification harnesses** (backend, plain Node scripts) and a **frontend unit test suite** (Jest via react-scripts). None of them need an API key or a database — except the two optional live/DB scripts noted at the end.

## Quick start — run everything offline

```bash
# 1. Pipeline harnesses (from backend/)
cd backend
node pipeline/verify.mjs
node pipeline/verify_persistence.mjs
node pipeline/verify_ratelimit.mjs

# 2. Frontend unit tests (from project root)
cd ..
CI=true npx react-scripts test src/utils/learnReview.test.js --watchAll=false
```

Every script exits with code 0 and prints `ALL CHECKS PASSED` (or Jest's `8 passed`) when green.

---

## 1. `backend/pipeline/verify.mjs` — pipeline behavior harness

**Run:** `cd backend && node pipeline/verify.mjs`

Runs the **real orchestrator** (`runPipeline`) against a **scripted mock LLM** — no network, fully deterministic. The mock deliberately produces every failure mode the spec cares about: a clean pass, a fail-then-pass (1 retry), a fail-forever question, structural breaks, an answer leak (answer word appears twice), a duplicate of an already-studied Learn sentence, a banned answer (learned word in the unfamiliar condition), a duplicate answer, and an over-long generation batch.

It then asserts the spec's invariants:

- A pool of questions is generated, and batches are capped at the requested size.
- Accepted questions actually satisfy the criteria; rejected ones actually fail them.
- The retry loop revises a rejected question up to **3 times**, then drops it.
- Out-of-context questions (familiar + unfamiliar) are generated **and** filtered.
- Condition integrity: no Learn-sentence reuse, no learned/duplicate answers in ooc-unfamiliar, no answer leaks.
- `stats` are complete and self-consistent (accepted + dropped == candidates, retry counts match, start/done log events emitted).

This is the main "use logs and checks to ensure the pipeline works" deliverable.

## 2. `backend/pipeline/verify_persistence.mjs` — schema round-trip

**Run:** `cd backend && node pipeline/verify_persistence.mjs`

Runs the pipeline with a small mock LLM, maps the result with `persist.js` (`buildSessionUpdate`), builds a real Mongoose `Session` document and calls `validateSync()` on it. This exercises the **exact schema the server persists** without needing a database, and asserts the `questionBank` pools (in-context / ooc-familiar / ooc-unfamiliar) and `pipelineStats` round-trip with the right shapes and counts.

## 3. `backend/pipeline/verify_ratelimit.mjs` — Gemini rate-limit handling

**Run:** `cd backend && node pipeline/verify_ratelimit.mjs`

Unit-checks `rateLimit.js` with an injected fake sleep (no real waiting):

- 429/503 are retriable, 400 is not (fails immediately).
- The server's `retryDelay` hint (e.g. `"3s"`) is parsed and honored, with a fallback delay otherwise.
- The retry loop recovers after transient 429s, and gives up after `maxRetries` then throws.

## 4. `src/utils/learnReview.test.js` — Review word selection (Jest)

**Run (from project root):**

```bash
CI=true npx react-scripts test src/utils/learnReview.test.js --watchAll=false
```

> Use `react-scripts test`, **not** raw `npx jest` — the file uses ESM/CRA syntax that raw Jest isn't configured for. Plain `npm test` also works (interactive watch mode).

8 tests covering the pure helpers behind the Learn Review phase (`src/utils/learnReview.js`):

- Error rate is 0 for words with no tracked attempts.
- `findSentenceForWord` finds a sentence containing the word, falling back across sessions.
- `computeReviewWords` picks **2 highest-error + 2 lowest-frequency** words with no duplicates.
- Language scoping: review only pulls words from earlier sessions in the **same language**; `sessionLangKey` uses the persisted `language` field and falls back to script detection (Han → `zh`) for old sessions.
- A minimum-attempts floor (2) keeps thin samples (e.g. 1 wrong out of 1) out of the "highest error" picks.
- "Least seen" ranks by total practice **attempts** (exposure), not session count, so reviewed words rotate out.

---

## Optional: live / database checks (need credentials)

These are NOT part of the offline suite — they hit real services using `backend/.env` (`API_KEY` for Gemini, `MONGO_URI` for Atlas).

**`backend/pipeline/checkDb.mjs`** — read-only report against your real MongoDB: how many sessions have a `questionBank`/`pipelineStats`, per-condition pool sizes, a sample question, and a `WordStat` (error/frequency) summary. Answers "did the pipeline actually populate the DB?"

```bash
cd backend && node pipeline/checkDb.mjs
```

**`backend/pipeline/runLive.mjs`** — runs the pipeline end-to-end against real Gemini, optionally persisting:

```bash
node pipeline/runLive.mjs --demo                 # built-in conversation, no DB
node pipeline/runLive.mjs --latest               # latest ended session, read-only
node pipeline/runLive.mjs --latest --save        # ...and persist questionBank + stats
node pipeline/runLive.mjs --sessionId=<id> --save
```

---

## What is NOT auto-tested

UI flow behavior (study timer auto-advance, wrong-only re-queue in the quizzes, the completion screen, the dev "Skip to Review" backdoor) lives in `src/components/LearnMode.js` and is verified manually in the browser. The logic it depends on (review word selection) is what `learnReview.test.js` covers.
