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

  const allPool = useMemo(() => {
    return sessions
      .filter(s => s.questionPool?.length > 0)
      .flatMap(s => s.questionPool);
  }, [sessions]);

  const sorted = useMemo(() => {
    return [...allVocab]
      .map((v) => {
        const total = (v.stat?.correct || 0) + (v.stat?.wrong || 0);
        const rate = total === 0 ? 0.5 : v.stat.wrong / total;
        return { ...v, rate };
      })
      .sort((a, b) => a.rate - b.rate);
  }, [allVocab]);

  const questionsByCondition = useMemo(() => {
    const grouped = {
      in_context_familiar: [],
      in_context_unfamiliar: [],
      out_of_context_familiar: [],
      out_of_context_unfamiliar: [],
    };

    allPool.forEach((q) => {
      if (!q) return;

      if (grouped[q.condition]) {
        grouped[q.condition].push(q);
      }
    });
    return grouped;
  }, [allPool]);

  const poolMap = useMemo(() => {
    const map = {};
    sessions.forEach((s) => {
      (s.questionPool || []).forEach((q) => {
        const key = q.word.toLowerCase();
        if (!map[key]) map[key] = [];
        map[key].push(q);
      });
    });

    return map;
  }, [sessions]);

  console.log("ALL POOL:", allPool);
  console.log("GROUPED:", questionsByCondition);
  console.log("SESSION SAMPLE:", sessions[0]);

  const mcqQuestions = useMemo(() => {
    if (sorted.length === 0) return [];

    //middle 20 based on error rate
    const center = Math.floor(sorted.length / 2);
    const start = Math.max(0, center - 10);
    const middleWords = sorted.slice(start, start + 20);

    return shuffle(middleWords).map(v => ({
      id: `mcq_${v.word}`,
      word: v.word,
      answer: v.translation,
    }));
  }, [sorted]);

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

  const fillQuestions = useMemo(() => {
    const build = (arr, type) =>
      shuffle(arr)
        .slice(0, 10)
        .map((q, index) => ({
          id: `${type}_${index}_${Math.random()}`,
          type,
          word: q.word,
          question: q.question,
          answer: q.word,
          translation: q.translation
        }));

    return [
      ...build(questionsByCondition.in_context_familiar || [], "in_context_familiar"),
      ...build(questionsByCondition.in_context_unfamiliar || [], "in_context_unfamiliar"),
      ...build(questionsByCondition.out_of_context_familiar || [], "out_of_context_familiar"),
      ...build(questionsByCondition.out_of_context_unfamiliar || [], "out_of_context_unfamiliar"),
    ];
  }, [questionsByCondition]);

  const fillOptionsMap = useMemo(() => {
    const map = {};
    fillQuestions.forEach((q) => {
      const correct = allVocab.find(v => v.word === q.word);
      const distractors = shuffle(
        allVocab.filter(v => v.word !== q.word)
      ).slice(0, 3);
      map[q.id] = shuffle([correct, ...distractors].filter(Boolean));
    });
    return map;
  }, [fillQuestions, allVocab]);

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

  useEffect(() => {
    if (sessions.length > 0) {
      console.log("FULL SESSION:", JSON.stringify(sessions[0], null, 2));
    }
  }, [sessions]);
  
  console.log("CONDITION COUNTS:", {
    in_context_familiar: questionsByCondition.in_context_familiar.length,
    in_context_unfamiliar: questionsByCondition.in_context_unfamiliar.length,
    out_of_context_familiar: questionsByCondition.out_of_context_familiar.length,
    out_of_context_unfamiliar: questionsByCondition.out_of_context_unfamiliar.length,
  });

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
      </section>

      <section>
        {/*Fill in Blank*/}
        <h2>✍️ Fill in the Blank (20)</h2>

        {fillQuestions.map((q) => {
          const options = fillOptionsMap[q.id] || [];

          return (
            <div key={q.id} style={{ marginBottom: 25, padding: 15, background: "white", borderRadius: 12 }}>

              <div style={{ fontWeight: 800, fontSize: "1rem", marginBottom: 6 }}>
                {q.question}
              </div>
              <div style={{ fontSize: "0.8rem", color: "#aaa", marginBottom: 10 }}>
                {q.translation}
              </div>

              {/* OPTIONS */}
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                {options.map((v) => (
                  <button
                    key={v.word}
                    disabled={submitted}
                    onClick={() => setAnswer(q.id, v.word)}
                    style={{
                      margin: 5,
                      padding: "8px 12px",
                      borderRadius: 10,
                      background: answers[q.id] === v.word ? "#c9b3f5" : "white",
                      border: "1px solid #ddd",
                    }}
                  >
                    {v.word}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </section>

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
    </div >
  );
}

export default TestMode;