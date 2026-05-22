import { useEffect, useState, useMemo } from "react";

const shuffle = (arr) =>
  [...arr].sort(() => Math.random() - 0.5);

const TestMode = ({ onBack }) => {
  const [sessions, setSessions] = useState([]);
  const userId = localStorage.getItem("userId");
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(null);
  const [answers, setAnswers] = useState({});

  useEffect(() => {
    if (!userId) return;

    fetch(`http://localhost:3001/api/user/${userId}/sessions`)
      .then(r => r.json())
      .then(setSessions);
  }, [userId]);

  const allVocab = useMemo(() => sessions.flatMap((s) => s.vocab || []), [sessions]);
  const allPool = useMemo(() => sessions.flatMap((s) => s.questionPool || []), [sessions]);

  const sorted = useMemo(() => {
    return [...allVocab]
      .map((v) => {
        const total = (v.stat?.correct || 0) + (v.stat?.wrong || 0);
        const rate = total === 0 ? 0.5 : v.stat.wrong / total;
        return { ...v, rate };
      })
      .sort((a, b) => a.rate - b.rate);
  }, [allVocab]);

  const pickFive = (arr) => shuffle(arr).slice(0, 5);

  //middle 15 words (based on error rate)
  const middleStart = Math.floor(sorted.length / 2) - 7;

  const in_context_familiar = sorted.slice(middleStart, middleStart + 15);
  const in_context_unfamiliar = shuffle(sorted.filter((v) => !in_context_familiar.includes(v))).slice(0, 15);
  const out_of_context_familiar = shuffle(sorted.slice(15, 30));
  const out_of_context_unfamiliar = shuffle(sorted.slice(-15));

  const conditions = [
    { id: "in_context_familiar", words: in_context_familiar },
    { id: "in_context_unfamiliar", words: in_context_unfamiliar },
    { id: "out_of_context_familiar", words: out_of_context_familiar },
    { id: "out_of_context_unfamiliar", words: out_of_context_unfamiliar },
  ];

  const poolMap = useMemo(() => {
    const map = {};
    sessions.forEach((s) => {
      (s.questionPool || []).forEach((q) => {
        if (!map[q.word]) map[q.word] = [];
        map[q.word].push(q);
      });
    });

    return map;
  }, [sessions]);

  const buildSet = (words, type) => {
    const selected = pickFive(words);

    return selected.map((w) => {

      const poolQuestion =
        poolMap[w.word]?.find(
          (q) => q.condition?.includes(type)
        );

      return {
        id: `${type}_${w.word}_${Math.random()}`,
        word: w.word,
        answer: w.translation,
        sentence: poolQuestion?.question || "",
        type,
      };
    });
  };

  //all 60 Questions
  const mcqQuestions = useMemo(
    () => [
      ...buildSet(in_context_familiar, "in_context_familiar"),
      ...buildSet(in_context_unfamiliar, "in_context_unfamiliar"),
      ...buildSet(out_of_context_familiar, "out_of_context_familiar"),
      ...buildSet(out_of_context_unfamiliar, "out_of_context_unfamiliar"),
    ],
    [sorted, sessions]
  );

  const mcqOptionsMap = useMemo(() => {
    const map = {};

    mcqQuestions.forEach((q) => {
      const distractors = allVocab
        .filter((v) => v.word !== q.word)
        .map((v) => v.translation);

      const shuffledDistractors = shuffle(distractors).slice(0, 3);

      const options = shuffle([q.answer, ...shuffledDistractors]);

      map[q.id] = options;
    });

    return map;
  }, [mcqQuestions, allVocab]);

  const matchQuestions = useMemo(
    () => [
      ...buildSet(in_context_familiar, "in_context_familiar"),
      ...buildSet(in_context_unfamiliar, "in_context_unfamiliar"),
      ...buildSet(out_of_context_familiar, "out_of_context_familiar"),
      ...buildSet(out_of_context_unfamiliar, "out_of_context_unfamiliar"),
    ],
    [sorted, sessions]
  );

  const fillQuestions = useMemo(
    () => [
      ...buildSet(in_context_familiar, "in_context_familiar"),
      ...buildSet(in_context_unfamiliar, "in_context_unfamiliar"),
      //...buildSet(out_of_context_familiar, "out_of_context_familiar"),
      //...buildSet(out_of_context_unfamiliar, "out_of_context_unfamiliar"),
    ],
    [sorted, sessions]
  );

  const setAnswer = (id, value) => {
    setAnswers((prev) => ({
      ...prev,
      [id]: value,
    }));
  };

  const handleSubmit = () => {
    let correct = 0;
    let total = 0;

    const allQuestions = [
      ...mcqQuestions,
      ...matchQuestions,
      ...fillQuestions,
    ];

    allQuestions.forEach((q) => {
      total++;
      if (answers[q.id] === q.answer) {
        correct++;
      }
    });

    setScore({ correct, total });
    setSubmitted(true);
  };

  return (
    <div style={{
      minHeight: "100vh",
      padding: 40,
      fontFamily: "'Nunito', sans-serif",
      background:
        "linear-gradient(145deg, #fdf6f0, #f3eeff, #e8f8f5)"
    }}>

      <button onClick={onBack}>
        ← Back
      </button>

      <h1>Assessment</h1>
      {/*MCQ*/}
      <section>
        <h2>🎯 MCQ (20)</h2>
        {mcqQuestions.map((q) => (
          <div key={q.id} style={{ marginBottom: 15 }}>
            <p style={{ fontWeight: 800 }}>{q.word}</p>

            {mcqOptionsMap[q.id]?.map((opt) => (
              <button
                key={opt}
                disabled={submitted}
                onClick={() => setAnswer(q.id, opt)}
                style={{
                  margin: 5,
                  background: answers[q.id] === opt ? "#c9b3f5" : "white",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        ))}

        {/*Fill in Blank*/}
        <h2>✍️ Fill in the Blank (20)</h2>

        {fillQuestions.map((q) => (
          <div key={q.id} style={{ marginBottom: 25, padding: 15, background: "white", borderRadius: 12 }}>
            <div style={{ fontWeight: 800, fontSize: "1rem", marginBottom: 6 }}>
              {q.sentence}
            </div>
            <div style={{ fontSize: "0.85rem", color: "#9e8cc0", marginBottom: 12 }}>
              {q.answer}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap" }}>
              {allVocab
                .filter(v => v.word !== q.word)
                .sort(() => Math.random() - 0.5)
                .slice(0, 3)
                .concat(allVocab.find(v => v.word === q.word))
                .sort(() => Math.random() - 0.5)
                .map((v) => (
                  <button
                    key={v.word}
                    disabled={submitted}
                    onClick={() => setAnswer(q.id, v.translation)}
                    style={{
                      margin: 5,
                      padding: "8px 12px",
                      borderRadius: 10,
                      background: answers[q.id] === v.translation ? "#c9b3f5" : "white",
                      border: "1px solid #ddd",
                    }}
                  >
                    {v.translation}
                  </button>
                ))}
            </div>
          </div>
        ))}


        {!submitted ? (
          <button
            onClick={handleSubmit}
            style={{
              marginTop: 30,
              padding: 15,
              fontWeight: 800,
              background: "#7fc9a9",
              color: "white",
            }}
          >
            Submit Exam
          </button>
        ) : (
          <div style={{ marginTop: 30, fontSize: 18 }}>
            🎉 Score: {score.correct} / {score.total}
          </div>
        )}
      </section>
    </div>
  );
}

export default TestMode;