import { useEffect, useMemo, useState } from "react";

const shuffle = (arr) =>
  [...arr].sort(() => Math.random() - 0.5);

const ASSESSMENT_TIME = 30 * 60;

const TestMode = ({ onBack }) => {
  const [session, setSession] = useState(null);
  const [assessmentStarted, setAssessmentStarted] = useState(false);
  const [assessmentSubmitted, setAssessmentSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(ASSESSMENT_TIME);
  const [answers, setAnswers] = useState({});

  // Track when each question was first answered, plus when the whole
  // assessment began. Used to approximate "time taken" per question in
  // the report (see buildReport below).
  const [answerTimestamps, setAnswerTimestamps] = useState({});
  const [assessmentStartTime, setAssessmentStartTime] = useState(null);

  // Populated on submit — the full per-question report described in the
  // assessment doc (question, condition, answer, word accuracy, time taken).
  // Not sent anywhere yet, just held in state per your call.
  const [report, setReport] = useState(null);

  const userId = localStorage.getItem("userId");

  // The app doesn't currently pass a sessionId down to TestMode (App.jsx
  // never captures one from LearnMode). LearnMode resolves "the current
  // session" the same way: fetch all sessions for this user, sort by
  // createdAt, take the most recent. We mirror that here so the
  // assessment always runs against the study session the user just did.
  const startAssessment = async () => {
    if (!userId) {
      console.error("START ASSESSMENT ERROR: no userId in localStorage");
      return;
    }

    try {
      const res = await fetch(
        `http://localhost:3001/api/user/${userId}/sessions`
      );

      if (!res.ok) {
        throw new Error("Failed to load assessment data");
      }

      const userSessions = await res.json();

      const mostRecentSession = [...userSessions].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      )[0];

      if (!mostRecentSession) {
        throw new Error("No sessions found for this user");
      }

      setSession(mostRecentSession);
      console.log("SESSION DATA:", mostRecentSession);
      setTimeLeft(ASSESSMENT_TIME);
      setAssessmentStarted(true);
      setAssessmentStartTime(Date.now());
    } catch (err) {
      console.error("START ASSESSMENT ERROR:", err);
    }
  };

  const allVocab = useMemo(() => {
    return session?.vocab || [];
  }, [session]);

  const allPool = useMemo(() => {
    return session?.questionPool || [];
  }, [session]);

  // Highest error rate first, so the top slice below is the "hardest" words.
  const sortedVocab = useMemo(() => {
    return [...allVocab]
      .map((vocab) => {
        const correct = vocab.stat?.correct || 0;
        const wrong = vocab.stat?.wrong || 0;
        const total = correct + wrong;

        const errorRate = total === 0 ? 0.5 : wrong / total;

        return {
          ...vocab,
          errorRate,
        };
      })
      .sort((a, b) => b.errorRate - a.errorRate);
  }, [allVocab]);

  const questionsByCondition = useMemo(() => {
    const grouped = {
      in_context_familiar: [],
      in_context_unfamiliar: [],
      out_of_context_familiar: [],
      out_of_context_unfamiliar: [],
    };

    allPool.forEach((question) => {
      if (!question) return;

      if (grouped[question.condition]) {
        grouped[question.condition].push(question);
      }
    });

    return grouped;
  }, [allPool]);

  // Doc: MCQ = 20 questions, top 20 words by highest error rate.
  const mcqQuestions = useMemo(() => {
    const topTwentyWords = sortedVocab.slice(0, 20);

    return shuffle(topTwentyWords).map((vocab, index) => ({
      id: `mcq_${index}_${vocab.word}`,
      condition: "mcq",
      word: vocab.word,
      answer: vocab.translation,
    }));
  }, [sortedVocab]);

  const mcqOptionsMap = useMemo(() => {
    const optionsMap = {};

    mcqQuestions.forEach((question) => {
      const distractors = shuffle(
        allVocab
          .filter((vocab) => vocab.word !== question.word)
          .map((vocab) => vocab.translation)
          .filter(Boolean)
      ).slice(0, 3);

      optionsMap[question.id] = shuffle([
        question.answer,
        ...distractors,
      ]);
    });

    return optionsMap;
  }, [mcqQuestions, allVocab]);

  // Doc: Fill in the Blank = 40 questions, 10 per condition.
  // Stable IDs (word-based, not random) so answers/timestamps don't get
  // orphaned across re-renders.
  const fillQuestions = useMemo(() => {
    const buildQuestions = (questions, condition) =>
      shuffle(questions)
        .slice(0, 10)
        .map((question, index) => ({
          id: `${condition}_${index}_${question.word}`,
          condition,
          word: question.word,
          answer: question.answer || question.word,
          question:
            question.cloze ||
            question.question ||
            question.sentence ||
            "",
          translation:
            question.sentenceTranslation ||
            question.translation ||
            "",
        }));

    return [
      ...buildQuestions(
        questionsByCondition.in_context_familiar,
        "in_context_familiar"
      ),
      ...buildQuestions(
        questionsByCondition.in_context_unfamiliar,
        "in_context_unfamiliar"
      ),
      ...buildQuestions(
        questionsByCondition.out_of_context_familiar,
        "out_of_context_familiar"
      ),
      ...buildQuestions(
        questionsByCondition.out_of_context_unfamiliar,
        "out_of_context_unfamiliar"
      ),
    ];
  }, [questionsByCondition]);

  const fillOptionsMap = useMemo(() => {
    const map = {};
    fillQuestions.forEach((q) => {
      const correct = allVocab.find((v) => v.word === q.word);
      const distractors = shuffle(
        allVocab.filter((v) => v.word !== q.word)
      ).slice(0, 3);
      map[q.id] = shuffle([correct, ...distractors].filter(Boolean));
    });
    return map;
  }, [fillQuestions, allVocab]);

  const setAnswer = (questionId, value) => {
    setAnswers((previousAnswers) => ({
      ...previousAnswers,
      [questionId]: value,
    }));

    // Only record the timestamp the first time a question is answered,
    // so changing your mind later doesn't reset the "time taken" clock.
    setAnswerTimestamps((previousTimestamps) =>
      previousTimestamps[questionId]
        ? previousTimestamps
        : { ...previousTimestamps, [questionId]: Date.now() }
    );
  };

  // Builds the per-question report the doc asks for:
  // question, condition, answer given, word accuracy rate, time taken.
  //
  // "Time taken" is approximated as the gap between this question's
  // answer timestamp and the previous one answered (chronologically),
  // since we don't currently track when a question first came into view.
  const buildReport = () => {
    const allQuestions = [...mcqQuestions, ...fillQuestions];

    const answeredInOrder = allQuestions
      .filter((q) => answerTimestamps[q.id])
      .sort((a, b) => answerTimestamps[a.id] - answerTimestamps[b.id]);

    const timeTakenMap = {};
    let previousTimestamp = assessmentStartTime;

    answeredInOrder.forEach((q) => {
      const ts = answerTimestamps[q.id];
      timeTakenMap[q.id] = previousTimestamp
        ? Math.round((ts - previousTimestamp) / 1000)
        : null;
      previousTimestamp = ts;
    });

    return allQuestions.map((q) => {
      const vocabStat = sortedVocab.find((v) => v.word === q.word);
      const userAnswer = answers[q.id] ?? null;

      return {
        questionId: q.id,
        question: q.question || q.word,
        condition: q.condition,
        answer: userAnswer,
        correctAnswer: q.answer,
        isCorrect: userAnswer === q.answer,
        wordErrorRate: vocabStat?.errorRate ?? null,
        timeTakenSeconds: timeTakenMap[q.id] ?? null,
      };
    });
  };

  const submitAssessment = () => {
    setReport(buildReport());
    setAssessmentSubmitted(true);
  };

  useEffect(() => {
    if (!assessmentStarted || assessmentSubmitted) return;

    const timer = setInterval(() => {
      setTimeLeft((previousTime) => {
        if (previousTime <= 1) {
          clearInterval(timer);
          return 0;
        }

        return previousTime - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [assessmentStarted, assessmentSubmitted]);

  useEffect(() => {
    if (
      assessmentStarted &&
      !assessmentSubmitted &&
      timeLeft === 0
    ) {
      submitAssessment();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentStarted, assessmentSubmitted, timeLeft]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const progressPercent =
    ((ASSESSMENT_TIME - timeLeft) / ASSESSMENT_TIME) * 100;

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "'Nunito', sans-serif",
        background:
          "linear-gradient(145deg, #fdf6f0, #f3eeff, #e8f8f5)",
      }}
    >
      <div style={{ padding: 30 }}>
        <button
          onClick={onBack}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontWeight: 700,
            color: "#7a6a9d",
          }}
        >
          ← Back
        </button>

        {assessmentSubmitted ? (
          <div
            style={{
              minHeight: "calc(100vh - 100px)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 620,
                padding: "48px 40px",
                borderRadius: 24,
                background: "rgba(255,255,255,0.68)",
                backdropFilter: "blur(16px)",
                textAlign: "center",
                boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  margin: "0 auto 20px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background:
                    "linear-gradient(135deg, #9178cc, #b49ee8)",
                  color: "white",
                  fontSize: "2rem",
                  fontWeight: 800,
                }}
              >
                ✓
              </div>

              <h2>Thank you for participating!</h2>

              <p style={{ color: "#7a6a9d" }}>
                Your assessment has been submitted successfully.
              </p>
            </div>
          </div>
        ) : !assessmentStarted ? (
          <div
            style={{
              minHeight: "calc(100vh - 150px)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div
              style={{
                padding: 40,
                borderRadius: 24,
                background: "rgba(255,255,255,0.65)",
                backdropFilter: "blur(16px)",
                textAlign: "center",
                width: "100%",
                maxWidth: 600,
                boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
              }}
            >
              <h2 style={{ marginBottom: 10 }}>Assessment</h2>

              <p style={{ color: "#7a6a9d", marginBottom: 30 }}>
                You will have <b>30 minutes</b> to complete the
                assessment.
                <br />
                Once you begin, the timer will start immediately.
              </p>

              <button
                onClick={startAssessment}
                disabled={!userId}
                style={{
                  padding: "14px 36px",
                  border: "none",
                  borderRadius: 18,
                  background:
                    "linear-gradient(135deg, #9178cc, #b49ee8)",
                  color: "white",
                  fontWeight: 700,
                  fontSize: "1rem",
                  cursor: userId ? "pointer" : "not-allowed",
                  opacity: userId ? 1 : 0.6,
                  boxShadow:
                    "0 8px 20px rgba(145,120,204,0.25)",
                }}
              >
                Start Assessment
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 10,
                padding: "18px 0 22px",
                marginBottom: 24,
                background: "rgba(247,243,255,0.92)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                  fontWeight: 700,
                }}
              >
                <span>Assessment Progress</span>

                <span
                  style={{
                    color:
                      timeLeft <= 300 ? "#b84a62" : "#7a6a9d",
                  }}
                >
                  {minutes}:{String(seconds).padStart(2, "0")}
                </span>
              </div>

              <div
                style={{
                  width: "100%",
                  height: 12,
                  borderRadius: 999,
                  background: "rgba(145,120,204,0.16)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: "100%",
                    borderRadius: 999,
                    background:
                      "linear-gradient(90deg, #9178cc, #b49ee8)",
                    transition: "width 1s linear",
                  }}
                />
              </div>
            </div>

            <section>
              <h2>Multiple Choice</h2>

              {mcqQuestions.map((question, index) => (
                <div
                  key={question.id}
                  style={{
                    marginBottom: 20,
                    padding: 18,
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.65)",
                    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                  }}
                >
                  <p style={{ fontWeight: 800 }}>
                    {index + 1}. {question.word}
                  </p>

                  {mcqOptionsMap[question.id]?.map((option) => (
                    <button
                      key={option}
                      onClick={() =>
                        setAnswer(question.id, option)
                      }
                      style={{
                        margin: 5,
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        cursor: "pointer",
                        background:
                          answers[question.id] === option
                            ? "#c9b3f5"
                            : "white",
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ))}
            </section>

            <section>
              <h2>Fill in the Blank</h2>

              {fillQuestions.map((q) => {
                const options = fillOptionsMap[q.id] || [];

                return (
                  <div
                    key={q.id}
                    style={{
                      marginBottom: 25,
                      padding: 15,
                      background: "white",
                      borderRadius: 12,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: "1rem",
                        marginBottom: 6,
                      }}
                    >
                      {q.question}
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "#aaa",
                        marginBottom: 10,
                      }}
                    >
                      {q.translation}
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap" }}>
                      {options.map((v) => (
                        <button
                          key={v.word}
                          disabled={assessmentSubmitted}
                          onClick={() => setAnswer(q.id, v.word)}
                          style={{
                            margin: 5,
                            padding: "8px 12px",
                            borderRadius: 10,
                            background:
                              answers[q.id] === v.word
                                ? "#c9b3f5"
                                : "white",
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

            <button
              onClick={submitAssessment}
              style={{
                display: "block",
                margin: "30px auto 10px",
                padding: "14px 36px",
                border: "none",
                borderRadius: 18,
                background:
                  "linear-gradient(135deg, #9178cc, #b49ee8)",
                color: "white",
                fontWeight: 700,
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              Submit Assessment
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default TestMode;