const REVIEW_WORD_COUNT = 4;

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

// Frequency = how many of the user's sessions a word appears in. Duplicate
// entries inside one session count once.
export const computeFrequency = (sessions) => {
  const freq = {};
  sessions.forEach((s) => {
    const seenInSession = new Set();
    (s.vocab || []).forEach((v) => {
      if (!v.word || seenInSession.has(v.word)) return;
      seenInSession.add(v.word);
      freq[v.word] = (freq[v.word] || 0) + 1;
    });
  });
  return freq;
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

  const freq = computeFrequency(sessions);
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

  const byError = [...pool].sort(
    (a, b) => errorRateOf(b.word, stats) - errorRateOf(a.word, stats)
  );
  const errorPicks = byError.slice(0, REVIEW_WORD_COUNT / 2);
  const picked = new Set(errorPicks.map((w) => w.word));

  const byFreq = pool
    .filter((w) => !picked.has(w.word))
    .sort((a, b) => (freq[a.word] || 0) - (freq[b.word] || 0));
  const freqPicks = byFreq.slice(0, REVIEW_WORD_COUNT - errorPicks.length);

  return [...errorPicks, ...freqPicks];
};
