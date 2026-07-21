import { useEffect, useMemo, useState } from "react";

const shuffle = (arr) =>
  [...arr].sort(() => Math.random() - 0.5);

const ASSESSMENT_TIME = 30 * 60;

const TestMode = ({ onBack, sessionId }) => {
  const [session, setSession] = useState(null);
  const [assessmentStarted, setAssessmentStarted] = useState(false);
  const [assessmentSubmitted, setAssessmentSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(ASSESSMENT_TIME);
  const [answers, setAnswers] = useState({});

  const startAssessment = async () => {
    try {
      const res = await fetch(
        `http://localhost:3001/api/session/${sessionId}`
      );

      if (!res.ok) {
        throw new Error("Failed to load assessment data");
      }

      const data = await res.json();

      setSession(data);
      setTimeLeft(ASSESSMENT_TIME);
      setAssessmentStarted(true);
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

  const mcqQuestions = useMemo(() => {
    const topTwentyWords = sortedVocab.slice(0, 20);

    return shuffle(topTwentyWords).map((vocab, index) => ({
      id: `mcq_${index}_${vocab.word}`,
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

  const setAnswer = (questionId, value) => {
    setAnswers((previousAnswers) => ({
      ...previousAnswers,
      [questionId]: value,
    }));
  };

  const submitAssessment = () => {
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
                disabled={!sessionId}
                style={{
                  padding: "14px 36px",
                  border: "none",
                  borderRadius: 18,
                  background:
                    "linear-gradient(135deg, #9178cc, #b49ee8)",
                  color: "white",
                  fontWeight: 700,
                  fontSize: "1rem",
                  cursor: sessionId ? "pointer" : "not-allowed",
                  opacity: sessionId ? 1 : 0.6,
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

              {fillQuestions.map((question, index) => (
                <div
                  key={question.id}
                  style={{
                    marginBottom: 18,
                    padding: 18,
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.65)",
                    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                  }}
                >
                  <p style={{ fontWeight: 700 }}>
                    {index + 1}. {question.question}
                  </p>

                  {question.translation && (
                    <p
                      style={{
                        color: "#9e8cc0",
                        fontSize: "0.9rem",
                      }}
                    >
                      {question.translation}
                    </p>
                  )}

                  <input
                    value={answers[question.id] || ""}
                    onChange={(event) =>
                      setAnswer(question.id, event.target.value)
                    }
                    placeholder="Type your answer"
                    style={{
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 10,
                      border: "1px solid #d8ccef",
                      width: "100%",
                      maxWidth: 400,
                    }}
                  />
                </div>
              ))}
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