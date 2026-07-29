# Question-generation pipeline

Turns a finished conversation into a filtered bank of beginner fill-in-the-blank
questions for the Learn Fill activity and the Assessment. Prompts and criteria are
grounded in **LingoQ** (`naver-ai/lingoque-monorepo`, `data/prompts`): separate
generation vs. review prompts, a per-criterion filter verdict, and a
minimal-change revision step.

## Flow

```
conversation
  (1) extract X vocab words            → prompts.vocabExtractionPrompt
      (skipped when session.vocab is provided, or when the transcript is empty)
  for each word:
    (2) generate Y in-context Qs        → prompts.contextQuestionPrompt
        (batch capped at Y; Learn sentences passed as a DO-NOT-REUSE list)
    for each candidate:
      (3) structuralCheck → dedupe → LLM filter → prompts.questionFilterPrompt
          if rejected → revise & re-filter, up to 3× (maxRetries), else DROP
  (4) out-of-context Qs (familiar + unfamiliar), same filter+retry loop
      (unfamiliar answers must be NEW words: learned/duplicate answers dropped)
```

When run for a real session the learned words (`session.vocab`) are passed in, so
Stage 1 is skipped and the in-context / out-of-context-familiar questions target
the exact words the user studied. The Learn sentences (`session.sentences`) are
passed as `avoidSentences` so generated questions can never repeat a sentence the
user already studied.

## Deterministic condition-integrity checks (no LLM call needed)

These run before the LLM filter and protect the assessment conditions:

| check | failure id | what happens |
|---|---|---|
| answer word missing from sentence | `CONTAINS_WORD` | revise (up to 3×) |
| answer word appears MORE than once (the cloze only blanks the first, so the rest would leak the answer) | `CONTAINS_WORD` | revise (up to 3×) |
| sentence equals a Learn sentence or an already-accepted question (normalized: case/space/punctuation-insensitive) | `DUPLICATE_SENTENCE` | revise (up to 3×) |
| ooc-unfamiliar answer is a learned word | `BANNED_ANSWER` | drop immediately* |
| ooc-unfamiliar answer repeats another unfamiliar question's answer | `DUPLICATE_ANSWER` | drop immediately* |

\* dropped without revision because revision is defined to KEEP the answer word
(so the tested word can never drift) — an invalid answer word is unfixable.
All blocks are counted in `pipelineStats.blocked`
(`{ duplicateSentences, bannedAnswers, duplicateAnswers }`).

Generation batches are also capped at the requested count (`candidates.truncated`
log event) so an over-generating model can't inflate LLM-filter cost.

## Files

The directory splits into three layers. The **core** is pure and offline; the
**integration** layer is the only place that touches Gemini or MongoDB; the
**scripts** are entry points you run by hand.

### Layer 1 — core (pure, no network, no DB)

| file | exports | what it does |
|---|---|---|
| `prompts.js` | `CRITERIA`, `criteriaFor`, `vocabExtractionPrompt`, `contextQuestionPrompt`, `outOfContextQuestionPrompt`, `questionFilterPrompt`, `questionRevisionPrompt`, `LANGUAGE_NAMES`, `langName` | Builds every prompt string sent to the model. One builder per pipeline stage. `CRITERIA` is the shared list of quality rules (`GRAMMATICAL`, `BEGINNER`, `UNAMBIGUOUS_ANSWER`, `CONTAINS_WORD`, …) that the filter prompt embeds and the revision prompt references, so generation and review can never drift apart. `criteriaFor(mode)` narrows the list for `"in_context"` vs `"out_of_context"`. Takes plain objects in, returns strings out — no side effects. |
| `parse.js` | `parseModelJson`, `normalizeVocab`, `normalizeQuestions`, `normalizeFilterVerdict`, `structuralCheck`, `cloze`, `countOccurrences`, `sentenceKey`, `wordKey` | Turns messy model output into trusted data. `parseModelJson` digs JSON out of a response that may be fenced or prose-wrapped; the `normalize*` functions coerce it to a fixed shape and drop garbage; `cloze()` blanks the answer word out of the sentence; `structuralCheck()` is the **deterministic** gate that runs *before* any LLM filter call (length, answer-present, answer-appears-exactly-once). `sentenceKey`/`wordKey` are the normalization used for duplicate detection — case-, space-, and punctuation-insensitive. |
| `orchestrator.js` | `runPipeline`, `createConsoleLogger` (+ default = `runPipeline`) | The engine, and the largest file here. Wires prompts → llm → parsers, runs all four stages, owns the **3× revise-and-refilter loop**, tracks `usedSentenceKeys` to block duplicates, and accumulates the whole `stats` object. Its `llm` parameter is an **injected** `(prompt: string) => Promise<string>` — that single design choice is what lets every verification script drive the real orchestrator with a scripted mock instead of the network. `logger` is likewise injected: it's just `(entry) => void`, and each `entry` carries `{ level, stage, event, msg, …}`, which makes the log stream both human-readable and machine-assertable. |
| `index.js` | re-exports all of `prompts.js` + `parse.js`, plus `runPipeline` / `createConsoleLogger` | Barrel module. Import from here (`./pipeline/index.js`) rather than reaching into individual files. Also carries the flow diagram in its header comment. |

### Layer 2 — integration (the only files that talk to the outside world)

| file | exports | what it does |
|---|---|---|
| `geminiClient.js` | `createGeminiLLM` | **The only networked module.** Wraps `@google/genai` into the plain `(prompt) => Promise<string>` shape the orchestrator wants, and wraps *that* in the throttle/retry from `rateLimit.js`. Reads `API_KEY`, `PIPELINE_MODEL`, `PIPELINE_MIN_INTERVAL_MS`, `PIPELINE_LLM_RETRIES`. Throws immediately if `apiKey` is missing. |
| `rateLimit.js` | `createThrottledRetry`, `isRetriableError`, `parseRetryDelayMs`, `sleep` | Keeps a run alive on the Gemini free tier. `createThrottledRetry` returns a `run(fn)` wrapper that (a) holds an async-mutex gate so calls are spaced ≥ `minIntervalMs` apart *across the whole process*, and (b) retries on 429/503 using the server's own suggested `retryDelay` when it can parse one, else exponential backoff. `sleepFn` is injectable, so the retry logic is testable with zero real waiting. Non-retriable errors (e.g. a 400) propagate on the first attempt. |
| `sessionRunner.js` | `runPipelineForSession`, `conversationFromSession` | Glue between a Mongoose `Session` document and the pure orchestrator. Flattens `session.messages` into a `role: text` transcript, infers the language pair from `session.language` (this app is English ↔ Chinese, so the known language is just the other one), prefers `session.vocab` over Stage-1 extraction, passes `session.sentences` as `avoidSentences`, and reads every `PIPELINE_*` tuning env var. Still takes `llm` as a parameter, so it's mockable too. |
| `persist.js` | `buildQuestionBank`, `buildPipelineStats`, `buildSessionUpdate` | Pure mappers from a `runPipeline()` result to the exact `{ questionBank, pipelineStats }` shape stored on a Session. `pickQuestion` normalizes each question to the 8 persisted fields with defaults, so a partial result can never write `undefined` into the DB. `buildPipelineStats` adds the `poolSizes` roll-up. No DB import — that's what makes `verify_persistence.mjs` able to test persistence without a database. |
| `../models/Session.js` | `Session` | The schema, including the `questionBank` and `pipelineStats` sub-documents. |
| `../models/WordStat.js` | `WordStat` | Per-word error/frequency tracking; read by `checkDb.mjs` for its summary. |

### Layer 3 — runnable scripts

| file | needs network? | needs DB? | writes? | what it's for |
|---|---|---|---|---|
| `verify.mjs` | no | no | no | Full-pipeline correctness against a scripted mock LLM |
| `verify_persistence.mjs` | no | no | no | DB *shape* correctness via `validateSync()` |
| `verify_ratelimit.mjs` | no | no | no | Throttle + 429/503 backoff logic |
| `runLive.mjs` | **yes** | yes (unless `--demo`) | only with `--save` | Real end-to-end run / backfill |
| `checkDb.mjs` | no | **yes** | no (read-only) | Inspect what actually landed in Mongo |

---

## Testing: which files check the pipeline

There are **three offline verification scripts** and **two live inspection
scripts**. The offline three are the actual test suite — they need no API key,
no internet, and no MongoDB, so they run in a couple of seconds and are the
right thing to run after any change to the core layer. Each exits `0` on
success and `1` on failure, and prints a `PASS`/`FAIL` line per assertion.

### The offline suite (run these after every change)

```bash
cd backend
node pipeline/verify.mjs && node pipeline/verify_persistence.mjs && node pipeline/verify_ratelimit.mjs
```

**`verify.mjs` — the main harness.** Runs the *real* `runPipeline()` against a
hand-scripted mock LLM that deliberately emits one of every pathological case,
then asserts ~30 invariants. The mock returns, on purpose:

| planted case | expected pipeline behaviour |
|---|---|
| a clean question | accepted with `retries === 0` |
| a >40-char sentence | structural `BEGINNER` fail → revised → accepted at `retries === 1` |
| a `△`-marked sentence the mock filter always rejects | revised 3× then **dropped** |
| a sentence equal to a Learn sentence | `DUPLICATE_SENTENCE` → revised |
| a sentence with the answer word **twice** (cloze would leak it) | `CONTAINS_WORD` → revised |
| a 6th candidate when only 5 were requested | truncated, `candidates.truncated` logged |
| an ooc-unfamiliar answer that is a *learned* word | `BANNED_ANSWER` → dropped at `retries === 0` |
| an ooc-unfamiliar answer repeating another one | `DUPLICATE_ANSWER` → dropped at `retries === 0` |
| an answer word absent from its sentence | structural fail → revised → accepted |

It then checks exact pool sizes (4 / 2 / 3), exact drop count (3), exact
revision count (7), that `accepted + dropped` equals total candidates, that no
accepted sentence repeats and none contains its answer twice, that
`pipeline.start`/`pipeline.done` were both logged, and — in a separate mini-run
— that an **empty conversation** skips extraction entirely without ever sending
the extraction prompt.

**`verify_persistence.mjs` — the DB-shape check.** Runs the pipeline with a
simpler mock, maps the result through `buildSessionUpdate()`, constructs a real
Mongoose `Session` document and calls `validateSync()` on it. That exercises the
exact schema `server.js` will save **without opening a connection**, so a field
you forgot to add to `models/Session.js` fails here rather than silently
vanishing in production. It also round-trips through `toObject()` to confirm
what a `.find()` would return.

**`verify_ratelimit.mjs` — the backoff check.** Pure unit tests on
`rateLimit.js` with an injected `sleepFn`, so it asserts the *durations* that
would have been slept without ever waiting. Covers: 429/503 classified as
retriable, 400 not; `"retryDelay": "3s"` parsed to 3250 ms (3 s + 250 ms
cushion); recovery after two 429s in exactly 3 attempts; non-retriable errors
propagating on attempt 1; and giving up after `maxRetries` (6 attempts total).

> **Gotcha when writing or editing a mock:** both mock LLMs dispatch by
> **substring-matching the prompt text** — `"most useful vocabulary"`
> (extraction), `"fill-in-the-blank practice"` (in-context generation),
> `"OUT-OF-CONTEXT"` (ooc generation, further split on `"already learned"`),
> `"STRICT quality reviewer"` (filter), `"quiz revision assistant"` (revision).
> If you reword those phrases in `prompts.js`, the mock falls through to
> `return "{}"` and the harness fails with *empty pools* rather than an obvious
> error. Update the mocks and the prompts together.

### The live scripts (need `API_KEY` / `MONGO_URI` in `backend/.env`)

```bash
cd backend

node pipeline/runLive.mjs --demo                  # built-in Chinese convo, no DB, prints logs+stats
node pipeline/runLive.mjs --latest                # newest ended session, dry run (nothing written)
node pipeline/runLive.mjs --latest --save         # ...and persist questionBank+pipelineStats
node pipeline/runLive.mjs --sessionId=<id> --save

node pipeline/checkDb.mjs                         # read-only: what's actually in Mongo?
```

`runLive.mjs --demo` is the fastest real-Gemini smoke test: no database
involved, verbose logging on, and it prints the three pool sizes plus a sample
cloze at the end. Default is a **dry run** — you must pass `--save` for anything
to be written. Expect a full session to take several minutes on the free tier
(the 4.5 s throttle × dozens of calls).

`checkDb.mjs` answers "did the pipeline actually complete and store its stats?"
It reports how many ended sessions have a `questionBank`/`pipelineStats`,
aggregate pool sizes, a warning if any banked session has all-empty pools, a
sample question, and a `WordStat` summary.

### Choosing a script

- Changed `prompts.js`, `parse.js`, or `orchestrator.js` → **`verify.mjs`**
- Changed `persist.js` or `models/Session.js` → **`verify_persistence.mjs`**
- Changed `rateLimit.js` or `geminiClient.js` → **`verify_ratelimit.mjs`**
- Want to see real model output / backfill a session → **`runLive.mjs`**
- Want to confirm what's stored → **`checkDb.mjs`**

If Gemini is unavailable (bad key, quota, or a `FAILED_PRECONDITION: User
location is not supported` geo-block), the three offline scripts still pass —
they never open a socket. That's the point of injecting `llm`.

## Assessment conditions ↔ bank pools

| Assessment condition | source |
|---|---|
| in context **familiar** | reuses the Learn sentences (`session.sentences`) — no bank needed |
| in context **unfamiliar** | `questionBank.inContextUnfamiliar` |
| out of context **familiar** | `questionBank.outOfContextFamiliar` |
| out of context **unfamiliar** | `questionBank.outOfContextUnfamiliar` |

## Wiring & config

`server.js` fires `runPipelineInBackground()` from `POST /api/session/end`
**without awaiting**, so end-session returns immediately (the pipeline makes many
LLM calls). Set `PIPELINE_ENABLED=false` to disable. Learn is untouched — it still
reads `session.vocab` / `session.sentences`.

## Config (env vars)

All optional; defaults shown.

| var | default | meaning |
|---|---|---|
| `PIPELINE_ENABLED` | `true` | set `false` to skip the pipeline at session-end |
| `PIPELINE_MODEL` | `gemini-3.1-flash-lite-preview` | Gemini model used by the pipeline LLM client |
| `PIPELINE_MIN_INTERVAL_MS` | `4500` | min gap between LLM calls (~13 rpm, under the 15 rpm free tier) |
| `PIPELINE_LLM_RETRIES` | `5` | retries on 429/503, honoring the server's `retryDelay` |
| `PIPELINE_X` / `PIPELINE_Y` | `4` / `3` | words per session / in-context questions per word |
| `PIPELINE_OOC_FAM` / `PIPELINE_OOC_UNFAM` | `3` / `6` | out-of-context (familiar per word / unfamiliar total) |
| `PIPELINE_MAX_RETRIES` | `3` | revision attempts before a question is dropped |

## Rate limits & throughput

`geminiClient.js` + `rateLimit.js` throttle calls and retry on 429/503 with the
server's suggested delay, so a run survives the Gemini **free tier** — but that
tier is only ~15 req/min, so a full session (dozens of calls) takes several
minutes. For faster/complete runs use a paid key or higher-RPM model; the
pipeline code is unchanged either way.

## Criteria note (cloze vs MCQ)

`UNAMBIGUOUS_ANSWER` is calibrated for **cloze** (open blank), not LingoQ's
multiple-choice. Because many words can grammatically fit an open blank, the
filter passes when the target word is a natural fit for the sentence's meaning
(the learner also sees the translation as a clue) instead of demanding that no
other word could fit, and it gives borderline cases the benefit of the doubt.
Tighten `CRITERIA` / the filter's HOW TO DECIDE in `prompts.js` for stricter
questions.

## Persisted shape

```jsonc
session.questionBank = {
  generatedAt: Date,
  inContextUnfamiliar:   [{ word, wordTranslation, condition, sentence, answer, sentenceTranslation, cloze, retries }],
  outOfContextFamiliar:  [ ...same shape... ],
  outOfContextUnfamiliar:[ ...same shape (word may be empty)... ]
}
session.pipelineStats = { wordsExtracted, accepted, totalAccepted, dropped, revisions,
  llmCalls, maxRetries, inContext:{…}, oocFamiliar:{…}, oocUnfamiliar:{…},
  blocked:{ duplicateSentences, bannedAnswers, duplicateAnswers },
  poolSizes:{…}, durationMs, startedAt, finishedAt }
```
