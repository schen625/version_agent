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

| file | role |
|---|---|
| `prompts.js` | pure prompt builders + the shared `CRITERIA` list |
| `parse.js` | pure parsers: JSON extraction, cloze, verdict normalization, `structuralCheck` |
| `orchestrator.js` | `runPipeline()` — wires prompts+parsers to an **injectable** `llm`, runs the 3× retry loop, emits structured logs + `stats` |
| `geminiClient.js` | `createGeminiLLM()` — the only networked piece (Gemini adapter) |
| `sessionRunner.js` | `runPipelineForSession()` — builds the transcript, infers the language pair, maps output |
| `persist.js` | pure mappers → `{ questionBank, pipelineStats }` |
| `../models/Session.js` | Session schema (now with `questionBank` + `pipelineStats`) |
| `verify.mjs` | mock-LLM harness asserting pool / pass / fail / 3× retry / stats |
| `verify_persistence.mjs` | schema `validateSync` + mapper checks (no live DB) |
| `runLive.mjs` | run against **real** Gemini / Mongo (demo, latest, or by id) |
| `checkDb.mjs` | report whether Mongo has the pipeline stats |

## Assessment conditions ↔ bank pools

| Assessment condition | source |
|---|---|
| in context **familiar** | reuses the Learn sentences (`session.sentences`) — no bank needed |
| in context **unfamiliar** | `questionBank.inContextUnfamiliar` |
| out of context **familiar** | `questionBank.outOfContextFamiliar` |
| out of context **unfamiliar** | `questionBank.outOfContextUnfamiliar` |

## Run it

```bash
cd backend

# offline checks (no network) — all exit 0
node pipeline/verify.mjs              # pool / pass / fail / 3x retry / stats
node pipeline/verify_persistence.mjs  # DB shape (validateSync)
node pipeline/verify_ratelimit.mjs    # throttle + 429/503 backoff

# live (needs API_KEY; Mongo unless --demo)
node pipeline/runLive.mjs --demo                 # built-in convo, prints logs+stats
node pipeline/runLive.mjs --latest --save        # newest ended session → persist bank+stats
node pipeline/runLive.mjs --sessionId=<id> --save

# does MongoDB have the stats?
node pipeline/checkDb.mjs
```

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
