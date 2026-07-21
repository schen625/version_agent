import {
  computeReviewWords,
  errorRateOf,
  findSentenceForWord,
  sessionLangKey,
} from "./learnReview";

describe("learn review helpers", () => {
  test("returns zero error rate for words with no tracked attempts", () => {
    expect(errorRateOf("apple", {})).toBe(0);
    expect(errorRateOf("apple", { apple: { attempts: 0, errors: 4 } })).toBe(0);
  });

  test("finds a sentence containing the target word and falls back across sessions", () => {
    const selected = {
      sentences: [{ sentence: "No target here.", translation: "none" }],
    };
    const prior = {
      sentences: [{ sentence: "I ate an apple.", translation: "Comi una manzana." }],
    };

    expect(findSentenceForWord("apple", selected, [selected, prior])).toEqual({
      sentence: "I ate an apple.",
      translation: "Comi una manzana.",
    });
    expect(findSentenceForWord("pear", selected, [selected, prior])).toEqual({
      sentence: null,
      translation: null,
    });
  });

  test("selects two highest-error words and two lowest-frequency words without duplicates", () => {
    const sessions = [
      {
        _id: "day-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        vocab: [
          { word: "apple", translation: "manzana" },
          { word: "apple", translation: "manzana" },
          { word: "banana", translation: "platano" },
        ],
        sentences: [
          { sentence: "I ate an apple.", translation: "Comi una manzana." },
          { sentence: "The banana is yellow.", translation: "El platano es amarillo." },
        ],
      },
      {
        _id: "day-2",
        createdAt: "2026-01-02T00:00:00.000Z",
        vocab: [
          { word: "cherry", translation: "cereza" },
          { word: "banana", translation: "platano" },
          { word: "date", translation: "datil" },
        ],
        sentences: [
          { sentence: "The cherry is red.", translation: "La cereza es roja." },
          { sentence: "I packed a date.", translation: "Empaque un datil." },
        ],
      },
      {
        _id: "day-3",
        createdAt: "2026-01-03T00:00:00.000Z",
        vocab: [{ word: "elderberry", translation: "sauco" }],
      },
    ];
    const stats = {
      apple: { attempts: 10, errors: 5 },
      banana: { attempts: 10, errors: 2 },
      cherry: { attempts: 10, errors: 9 },
      date: { attempts: 1, errors: 0 },
    };

    const reviewWords = computeReviewWords(sessions[2], sessions, stats);

    expect(reviewWords.map((w) => w.word)).toEqual([
      "cherry",
      "apple",
      "date",
      "banana",
    ]);
    expect(new Set(reviewWords.map((w) => w.word)).size).toBe(reviewWords.length);
  });

  test("sessionLangKey prefers the persisted language, else infers script", () => {
    expect(sessionLangKey({ language: "zh", vocab: [{ word: "hola" }] })).toBe("zh");
    expect(sessionLangKey({ language: "EN" })).toBe("en");
    expect(sessionLangKey({ vocab: [{ word: "你好" }, { word: "猫" }] })).toBe("zh");
    expect(sessionLangKey({ vocab: [{ word: "hola" }, { word: "gato" }] })).toBe("latin");
  });

  test("excludes earlier sessions in a different language from review", () => {
    const sessions = [
      {
        _id: "es-1",
        language: "es",
        createdAt: "2026-01-01T00:00:00.000Z",
        vocab: [
          { word: "hola", translation: "hello" },
          { word: "gato", translation: "cat" },
        ],
      },
      {
        _id: "zh-1",
        language: "zh",
        createdAt: "2026-01-02T00:00:00.000Z",
        vocab: [
          { word: "你好", translation: "hello" },
          { word: "猫", translation: "cat" },
        ],
      },
      {
        _id: "zh-2",
        language: "zh",
        createdAt: "2026-01-03T00:00:00.000Z",
        vocab: [{ word: "谢谢", translation: "thanks" }],
      },
    ];

    const words = computeReviewWords(sessions[2], sessions, {}).map((w) => w.word);
    expect(words).toEqual(expect.arrayContaining(["你好", "猫"]));
    expect(words).not.toContain("hola");
    expect(words).not.toContain("gato");
  });

  test("infers language from vocab script for sessions saved before the language field", () => {
    const sessions = [
      {
        _id: "legacy-es",
        createdAt: "2026-01-01T00:00:00.000Z",
        vocab: [{ word: "perfectamente", translation: "perfectly" }],
      },
      {
        _id: "legacy-zh-1",
        createdAt: "2026-01-02T00:00:00.000Z",
        vocab: [{ word: "完美", translation: "perfect" }],
      },
      {
        _id: "legacy-zh-2",
        createdAt: "2026-01-03T00:00:00.000Z",
        vocab: [{ word: "谢谢", translation: "thanks" }],
      },
    ];

    const words = computeReviewWords(sessions[2], sessions, {}).map((w) => w.word);
    expect(words).toEqual(["完美"]);
  });

  test("excludes tiny-sample words from the highest-error picks (min attempts floor)", () => {
    const sessions = [
      {
        _id: "d1",
        createdAt: "2026-01-01T00:00:00.000Z",
        vocab: [
          { word: "alpha", translation: "a" },
          { word: "beta", translation: "b" },
          { word: "gamma", translation: "g" },
          { word: "delta", translation: "d" },
        ],
      },
      {
        _id: "d2",
        createdAt: "2026-01-02T00:00:00.000Z",
        vocab: [{ word: "later", translation: "l" }],
      },
    ];
    const stats = {
      alpha: { attempts: 1, errors: 1 },
      beta: { attempts: 10, errors: 6 },
      gamma: { attempts: 10, errors: 4 },
      delta: { attempts: 10, errors: 0 },
    };

    const review = computeReviewWords(sessions[1], sessions, stats).map((w) => w.word);
    expect(review.slice(0, 2)).toEqual(["beta", "gamma"]);
    expect(review.slice(0, 2)).not.toContain("alpha");
    expect(new Set(review).size).toBe(review.length);
  });

  test("ranks least-seen review picks by attempts (exposure), not session count", () => {
    const sessions = [
      {
        _id: "s1",
        createdAt: "2026-01-01T00:00:00.000Z",
        vocab: [
          { word: "A", translation: "a" },
          { word: "B", translation: "b" },
          { word: "C", translation: "c" },
          { word: "D", translation: "d" },
          { word: "E", translation: "e" },
        ],
      },
      {
        _id: "s2",
        createdAt: "2026-01-02T00:00:00.000Z",
        vocab: [
          { word: "C", translation: "c" },
          { word: "D", translation: "d" },
        ],
      },
      {
        _id: "s3",
        createdAt: "2026-01-03T00:00:00.000Z",
        vocab: [{ word: "Z", translation: "z" }],
      },
    ];
    const stats = {
      A: { attempts: 10, errors: 9 },
      B: { attempts: 10, errors: 8 },
      C: { attempts: 2, errors: 0 },
      D: { attempts: 3, errors: 0 },
      E: { attempts: 50, errors: 0 },
    };

    const review = computeReviewWords(sessions[2], sessions, stats).map((w) => w.word);
    expect(review.slice(0, 2)).toEqual(["A", "B"]);
    expect(review).toContain("C");
    expect(review).toContain("D");
    expect(review).not.toContain("E");
  });
});
