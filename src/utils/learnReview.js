const REVIEW_WORD_COUNT = 4;

// A word needs at least this many recorded attempts before its error rate is
// trusted for "highest error" ranking. Without a floor, a single wrong answer
// (1/1 = 100%) would outrank a genuinely hard word with a large sample.
const MIN_ERROR_ATTEMPTS = 2;

// Han / CJK ideographs — used to tell a Chinese session apart from a
// Latin-script one when a session predates the persisted `language` field.
const HAN = /[㐀-鿿豈-﫿]/;

// The language a session was practiced in. New sessions persist the target
// language as `session.language` (e.g. "zh"). Older sessions predate that
// field, so we infer the writing system from their vocab: Han characters →
// "zh", otherwise a generic "latin" bucket. Review uses this to only revisit
// words from earlier sessions in the SAME language, so e.g. leftover Spanish
// words can't surface in a Chinese session's review.
export const sessionLangKey = (session) => {
  if (session?.language) return String(session.language).toLowerCase();
  const sample = (session?.vocab || []).map((v) => v?.word || "").join("");
  return HAN.test(sample) ? "zh" : "latin";
};

export const errorRateOf = (word, stats) => {
  const st = stats[word];
  if (!st || !st.attempts) return 0;
  return st.errors / st.attempts;
};

export const findSentenceForWord = (word, session, allSessions) => {
  const search = (sess) =>
    (sess?.sentences || []).find((s) => s.sentence && s.sentence.includes(word));
  let hit = search(session);
  if (!hit) {
    for (const s of allSessions) {
      hit = search(s);
      if (hit) break;
    }
  }
  return hit
    ? { sentence: hit.sentence, translation: hit.translation }
    : { sentence: null, translation: null };
};

export const computeReviewWords = (selectedSession, sessions, stats) => {
  if (!selectedSession) return [];
  const selDate = new Date(selectedSession.createdAt).getTime();
  const selLang = sessionLangKey(selectedSession);

  // Only revisit words from earlier sessions in the SAME language as the one
  // being studied. Without this, the "least-seen (lowest frequency)" rule below
  // pulls in words from a rarely-used language (e.g. old Spanish sessions),
  // which is exactly why they leaked into Chinese reviews.
  const prior = sessions.filter(
    (s) =>
      s._id !== selectedSession._id &&
      sessionLangKey(s) === selLang &&
      new Date(s.createdAt).getTime() < selDate
  );
  if (!prior.length) return [];

  const seen = new Set();
  const pool = [];
  prior.forEach((s) =>
    (s.vocab || []).forEach((v) => {
      if (!v.word || seen.has(v.word)) return;
      seen.add(v.word);
      const sent = findSentenceForWord(v.word, s, sessions);
      pool.push({
        word: v.word,
        translation: v.translation,
        sentence: sent.sentence,
        sentenceTranslation: sent.translation,
      });
    })
  );
  if (!pool.length) return [];

  // Rank by error rate, but only for words with enough attempts to trust the
  // rate; thin-sample words rank as 0 and fall through to the frequency pass.
  // Ties are broken by raw error count (more total mistakes first).
  const rankErrorRate = (word) => {
    const st = stats[word];
    if (!st || (st.attempts || 0) < MIN_ERROR_ATTEMPTS) return 0;
    return errorRateOf(word, stats);
  };
  const byError = [...pool].sort((a, b) => {
    const d = rankErrorRate(b.word) - rankErrorRate(a.word);
    if (d !== 0) return d;
    return (stats[b.word]?.errors || 0) - (stats[a.word]?.errors || 0);
  });
  const errorPicks = byError.slice(0, REVIEW_WORD_COUNT / 2);
  const picked = new Set(errorPicks.map((w) => w.word));

  // "Least seen" = least practiced. Exposure is WordStat.attempts, which counts
  // every answer in BOTH Learn and Review — so a word that has been reviewed has
  // a higher count and rotates out, instead of getting stuck (which is what the
  // old session-count frequency did, since reviewing never raised it).
  const exposureOf = (word) => stats[word]?.attempts || 0;
  const byExposure = pool
    .filter((w) => !picked.has(w.word))
    .sort((a, b) => exposureOf(a.word) - exposureOf(b.word));
  const freqPicks = byExposure.slice(0, REVIEW_WORD_COUNT - errorPicks.length);

  return [...errorPicks, ...freqPicks];
};
