import { useState, useEffect, useMemo } from "react";
import ChatWindow from "./ChatWindow";

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const C = {
  bg: "linear-gradient(145deg, #fdf6f0 0%, #f3eeff 50%, #e8f8f5 100%)",
  card: "rgba(255,255,255,0.75)",
  cardBorder: "rgba(255,255,255,0.95)",
  border: "rgba(201,179,245,0.3)",
  accentPurple: "#c9b3f5",
  accentMint: "#a8d8ea",
  accentPink: "#f9c6d0",
  accentPeach: "#ffd6b0",
  textMain: "#6e5a9e",
  textSub: "#9e8cc0",
  textMuted: "#c4b0de",
  green: "#7fc9a9",
  red: "#ff8fa3",
};

const glassCard = {
  background: C.card,
  border: `2px solid ${C.cardBorder}`,
  borderRadius: 20,
  boxShadow: "0 6px 24px rgba(180,160,220,0.13)",
  backdropFilter: "blur(12px)",
};

const QuizBtn = ({ children, state, onClick }) => {
  const bg = state === "correct"
    ? "linear-gradient(135deg, #b5ead7, #7fc9a9)"
    : state === "wrong"
      ? "linear-gradient(135deg, #ffb7c5, #ff8fa3)"
      : "rgba(255,255,255,0.8)";
  return (
    <button onClick={onClick} style={{
      margin: 4, padding: "10px 20px",
      background: bg,
      color: state ? "white" : C.textMain,
      border: `2px solid ${state === "correct" ? "rgba(100,200,150,0.4)" : state === "wrong" ? "rgba(255,150,170,0.4)" : C.border}`,
      borderRadius: 14, fontSize: "0.88rem", fontWeight: 700,
      fontFamily: "'Nunito', sans-serif", cursor: "pointer",
      boxShadow: state === "correct" ? "0 4px 14px rgba(100,200,150,0.35)"
        : state === "wrong" ? "0 4px 14px rgba(255,150,170,0.35)"
          : "0 2px 8px rgba(180,160,220,0.15)",
      transition: "transform 0.15s, box-shadow 0.15s",
    }}
      onMouseEnter={e => !state && (e.currentTarget.style.transform = "translateY(-1px)")}
      onMouseLeave={e => !state && (e.currentTarget.style.transform = "translateY(0)")}
    >
      {children}
    </button>
  );
};

const RestartBtn = ({ onClick }) => (
  <button onClick={onClick} style={{
    padding: "6px 16px", fontSize: "0.78rem", fontFamily: "'Nunito', sans-serif",
    background: "rgba(255,255,255,0.7)", border: `2px solid ${C.border}`,
    color: C.textSub, borderRadius: 12, cursor: "pointer", fontWeight: 700,
    transition: "background 0.15s",
  }}
    onMouseEnter={e => e.currentTarget.style.background = "white"}
    onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.7)"}
  >
    ↺ Restart
  </button>
);

const DoneState = () => (
  <div style={{
    display: "flex", alignItems: "center", gap: 10,
    background: "rgba(181,234,215,0.35)", border: "2px solid rgba(127,201,169,0.4)",
    borderRadius: 16, padding: "16px 22px", color: "#3a9e75",
    fontWeight: 800, fontSize: "0.92rem",
  }}>
    🎉 All done!
  </div>
);

const SectionDivider = ({ emoji, title }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 12,
    margin: "32px 0 18px",
  }}>
    <div style={{
      width: 38, height: 38, borderRadius: 12, flexShrink: 0,
      background: "linear-gradient(135deg, #f9c6d0, #c9b3f5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 18, boxShadow: "0 3px 10px rgba(201,179,245,0.3)",
    }}>{emoji}</div>
    <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 900, color: C.textMain }}>{title}</h3>
    <div style={{ flex: 1, height: 2, background: C.border, borderRadius: 1 }} />
  </div>
);

const LearnMode = ({ mode }) => {
  const [tab, setTab] = useState("chat");
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatHistory, setChatHistory] = useState([]);
  const [sessionActive, setSessionActive] = useState(false);
  const [mcqMistakes, setMcqMistakes] = useState(0);
  const [fillMistakes, setFillMistakes] = useState(0);
  const [mcqOrder, setMcqOrder] = useState([]);
  const [fillSubset, setFillSubset] = useState([]);

  const userId = localStorage.getItem("userId");

  const fetchSessions = () => {
    if (!userId) return;
    fetch(`http://localhost:3001/api/user/${userId}/sessions`)
      .then(r => r.json()).then(setSessions);
  };

  useEffect(() => { fetchSessions(); }, [userId]);

  const vocab = selectedSession?.vocab || [];
  const sentences = (selectedSession?.sentences || []).slice(0, 4);
  const learnQuestions = selectedSession?.learnQuestions || [];

  const resetAll = () => {
    const vocabIndices = vocab.map((_, i) => i);
    const validQuestions = learnQuestions.filter(
      q => q && q.answer
    );
    setFillSubset(
      shuffle(validQuestions).slice(0, 4)
    );
    setMcqOrder(shuffle(vocabIndices));
    setMcqIndex(0); setMcqAnswered({}); setMcqDone(false); setMcqMistakes(0);
    setFillIndex(0); setFillAnswered({}); setFillDone(false); setFillMistakes(0);
  };

  useEffect(() => { if (selectedSession) resetAll(); }, [selectedSession]);

  const updateWordStats = async (word, isCorrect) => {
    if (!word) return;

    await fetch("http://localhost:3001/api/word-stat/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, word, isCorrect })
    });
  };

  const errorRate = (stat) => {
    const total = stat.correct + stat.wrong;
    if (total === 0) return 0;
    return stat.wrong / total;
  };

  // MCQ
  const [mcqIndex, setMcqIndex] = useState(0);
  const [mcqAnswered, setMcqAnswered] = useState({});
  const [mcqDone, setMcqDone] = useState(false);

  useEffect(() => { setMcqAnswered({}); }, [mcqIndex]);

  const mcqOptions = useMemo(() => {
    if (!vocab.length) return [];

    const currentIndex = mcqOrder[mcqIndex];
    const correct = vocab[currentIndex]?.translation;

    const wrong = shuffle(
      vocab
        .filter((_, i) => i !== currentIndex)
        .map(v => v.translation)
    ).slice(0, 4);

    return shuffle([correct, ...wrong]);
  }, [mcqIndex, vocab, mcqOrder]);

  const currentMCQIndex = mcqOrder[mcqIndex];
  const answerMCQ = (opt) => {
    const word = vocab[currentMCQIndex]?.word;
    const correct = vocab[currentMCQIndex]?.translation;
    const isCorrect = opt === correct;

    setMcqAnswered(p => ({
      ...p,
      [opt]: isCorrect ? "correct" : "wrong"
    }));

    if (!isCorrect) {
      setMcqMistakes(m => m + 1);
      return;
    }

    setTimeout(() => {
      if (mcqIndex + 1 >= mcqOrder.length) {
        if (mcqMistakes === 0) {
          setMcqDone(true);
        } else {
          setMcqIndex(0);
          setMcqMistakes(0);
          setMcqAnswered({});
        }
      } else {
        setMcqIndex(i => i + 1);
      }
    }, 400);
  };

  const resetMCQ = () => {
    const vocabIndices = vocab.map((_, i) => i);

    setMcqOrder(shuffle(vocabIndices));
    setMcqIndex(0);
    setMcqAnswered({});
    setMcqDone(false);
    setMcqMistakes(0);
  };

  // Fill
  const [fillIndex, setFillIndex] = useState(0);
  const [fillAnswered, setFillAnswered] = useState({});
  const [fillDone, setFillDone] = useState(false);

  useEffect(() => { setFillAnswered({}); }, [fillIndex]);
  const currentQuestion = fillSubset[fillIndex];

  const fillOptions = useMemo(() => {
    if (!currentQuestion) return [];

    const wrongAnswers = shuffle(
      vocab
        .filter(v => v.word !== currentQuestion.answer)
        .map(v => v.word)
    ).slice(0, 3);
    return shuffle([
      currentQuestion.answer,
      ...wrongAnswers
    ]);
  }, [currentQuestion, vocab]);

  const answerFill = (opt) => {
    if (!currentQuestion) return;

    const correct = currentQuestion.answer;
    const isCorrect = opt === correct;
    const word = currentQuestion.answer;
    updateWordStats(word, isCorrect);

    setFillAnswered(p => ({
      ...p,
      [opt]: isCorrect ? "correct" : "wrong"
    }));

    if (!isCorrect) {
      setFillMistakes(m => m + 1);
      return;
    }

    setTimeout(() => {
      if (fillIndex + 1 >= fillSubset.length) {
        if (fillMistakes === 0) {
          setFillDone(true);
        } else {
          setFillIndex(0);
          setFillMistakes(0);
          setFillAnswered({});
        }
      } else {
        setFillIndex(i => i + 1);
      }
    }, 400);
  };

  const resetFill = () => {
    const validQuestions = learnQuestions.filter(q =>
      q && q.answer && vocab.some(v => v.word === q.answer)
    );

    setFillSubset(shuffle(validQuestions).slice(0, 4));
    setFillIndex(0);
    setFillAnswered({});
    setFillDone(false);
    setFillMistakes(0);
  };

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: C.bg, fontFamily: "'Nunito', 'Segoe UI', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(201,179,245,0.35); border-radius: 4px; }
      `}</style>

      {/* Top Navigation (Chat/Learn) */}
      <div style={{
        display: "flex",
        background: "rgba(255,255,255,0.65)",
        backdropFilter: "blur(16px)",
        borderBottom: "2px solid rgba(255,255,255,0.9)",
        boxShadow: "0 2px 12px rgba(180,160,220,0.1)",
      }}>
        {[
          { key: "chat", label: "💬 Chat" },
          { key: "learn", label: "📚 Learn" },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => {
            if (key === "learn" && sessionActive) return alert("End session first");
            setTab(key);
          }} style={{
            flex: 1, padding: "16px 0",
            background: "none", border: "none",
            borderBottom: tab === key ? `3px solid ${C.accentPurple}` : "3px solid transparent",
            color: tab === key ? C.textMain : C.textMuted,
            fontSize: "0.9rem", fontWeight: 800,
            fontFamily: "'Nunito', sans-serif",
            cursor: "pointer", transition: "color 0.15s",
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {tab === "chat" && (
          <ChatWindow
            mode={mode}
            chatHistory={chatHistory}
            setChatHistory={setChatHistory}
            setSessionActiveGlobal={setSessionActive}
            refreshSessions={fetchSessions}
          />
        )}

        {tab === "learn" && (
          <div style={{ display: "flex", height: "100%", position: "relative" }}>
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                style={{
                  position: "absolute",
                  top: 16,
                  left: 16,
                  zIndex: 10,
                  padding: "6px 12px",
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  borderRadius: 10,
                  border: "1.5px solid rgba(201,179,245,0.4)",
                  background: "rgba(255,255,255,0.85)",
                  color: C.textSub,
                  cursor: "pointer",
                  backdropFilter: "blur(10px)",
                  boxShadow: "0 4px 12px rgba(180,160,220,0.2)",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "white"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.85)"}
              >
                Show Sessions
              </button>
            )}

            {/* Left Session Sidebar */}
            {sidebarOpen && (
              <div style={{
                width: 270, flexShrink: 0,
                background: "rgba(255,255,255,0.5)",
                backdropFilter: "blur(16px)",
                borderRight: "2px solid rgba(255,255,255,0.9)",
                padding: 16, overflowY: "auto",
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  margin: "4px 4px 14px",
                }}>
                  <p style={{
                    fontSize: "0.72rem",
                    fontWeight: 900,
                    color: C.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: "1.2px",
                    margin: 0,
                  }}>
                    📖 Past Sessions
                  </p>

                  <button
                    onClick={() => setSidebarOpen(false)}
                    style={{
                      padding: "4px 10px",
                      fontSize: "0.7rem",
                      fontWeight: 800,
                      borderRadius: 8,
                      border: "1.5px solid rgba(201,179,245,0.35)",
                      background: "rgba(255,255,255,0.7)",
                      color: C.textSub,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "white"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.7)"}
                  >
                    Hide
                  </button>

                </div>

                {sortedSessions.length === 0 && (
                  <div style={{
                    padding: "20px 12px", textAlign: "center",
                    color: C.textMuted, fontSize: "0.85rem", fontWeight: 600,
                  }}>
                    No sessions yet 🌱<br />
                    <span style={{ fontSize: "0.78rem" }}>Chat to get started!</span>
                  </div>
                )}

                {/* order sessions */}
                {sortedSessions.map((s) => {
                  const isSelected = selectedSession?._id === s._id;
                  return (
                    <div key={s._id} onClick={() => setSelectedSession(s)} style={{
                      padding: "14px 16px", marginBottom: 10, cursor: "pointer",
                      background: isSelected ? "rgba(201,179,245,0.2)" : "rgba(255,255,255,0.7)",
                      border: `2px solid ${isSelected ? "rgba(201,179,245,0.55)" : "rgba(255,255,255,0.9)"}`,
                      borderRadius: 18,
                      boxShadow: isSelected
                        ? "0 4px 16px rgba(201,179,245,0.25)"
                        : "0 2px 8px rgba(180,160,220,0.1)",
                      transition: "all 0.15s",
                    }}
                      onMouseEnter={e => !isSelected && (e.currentTarget.style.background = "rgba(255,255,255,0.9)")}
                      onMouseLeave={e => !isSelected && (e.currentTarget.style.background = "rgba(255,255,255,0.7)")}
                    >
                      <h4 style={{ margin: "0 0 4px", fontSize: "0.88rem", fontWeight: 800, color: C.textMain }}>
                        {s.title}
                      </h4>
                      <p style={{ margin: "0 0 8px", fontSize: "0.78rem", color: C.textSub, lineHeight: 1.4, fontWeight: 600 }}>
                        {s.summary}
                      </p>
                      <span style={{
                        fontSize: "0.7rem", fontWeight: 700, color: C.textMuted,
                        background: "rgba(201,179,245,0.2)", borderRadius: 8,
                        padding: "2px 8px", border: `1px solid ${C.border}`,
                      }}>
                        {new Date(s.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Main */}
            <div style={{ flex: 1, padding: "24px 32px", overflowY: "auto" }}>
              {!selectedSession ? (
                <div style={{
                  height: "100%", display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  gap: 14, color: C.textMuted,
                }}>
                  <div style={{ fontSize: 56 }}>👈</div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem" }}>
                    Pick a session to review!
                  </p>
                </div>
              ) : (
                <>
                  {/* List Vocab */}
                  <SectionDivider emoji="📚" title="Vocabulary" />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                    {vocab.map((v) => (
                      <div key={v.word} style={{
                        ...glassCard, padding: "8px 16px",
                        display: "flex", alignItems: "center", gap: 8,
                      }}>
                        <span style={{ fontWeight: 800, color: C.textMain, fontSize: "0.9rem" }}>{v.word}</span>
                        <span style={{ color: C.accentPurple, fontWeight: 700 }}>→</span>
                        <span style={{ fontWeight: 700, color: C.textSub, fontSize: "0.88rem" }}>{v.translation}</span>
                      </div>
                    ))}
                  </div>

                  {/* Sentences */}
                  <SectionDivider emoji="🧠" title="Sentences" />
                  {sentences.map((s, i) => {
                    const hasTranslation =
                      s.translation && typeof s.translation === "string" && s.translation.trim() !== "";
                    return (
                      <div key={i} style={{ marginBottom: 14 }}>
                        <div style={{ fontWeight: 700 }}>{s.sentence}</div>
                        <div style={{ fontSize: "0.82rem", color: "#9e8cc0", marginTop: 4 }}>
                          {hasTranslation ? s.translation : "⚠️ No translation available"}
                        </div>
                      </div>
                    );
                  })}

                  {/* MCQ */}
                  <SectionDivider emoji="🎯" title="Vocab Quiz" />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <RestartBtn onClick={resetMCQ} />
                    <span style={{ fontSize: "0.78rem", color: C.textMuted, fontWeight: 700 }}>
                      {mcqDone ? "Complete!" : `${mcqIndex + 1} / ${mcqOrder.length}`}
                    </span>
                  </div>
                  {!mcqDone ? (
                    <div style={{ ...glassCard, padding: "22px 26px" }}>
                      <p style={{ margin: "0 0 16px", fontSize: "1.15rem", fontWeight: 900, color: C.textMain }}>
                        {vocab[currentMCQIndex]?.word}
                      </p>
                      <p style={{ margin: "0 0 14px", fontSize: "0.82rem", color: C.textMuted, fontWeight: 700 }}>
                        Pick the correct translation 👇
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap" }}>
                        {mcqOptions.map(o => (
                          <QuizBtn key={o} state={mcqAnswered[o]} onClick={() => answerMCQ(o)}>{o}</QuizBtn>
                        ))}
                      </div>
                    </div>
                  ) : <DoneState />}

                  {/* Fill in The Blank */}
                  <SectionDivider emoji="✍️" title="Fill in the Blank" />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <RestartBtn onClick={resetFill} />
                    <span style={{ fontSize: "0.78rem", color: C.textMuted, fontWeight: 700 }}>
                      {fillDone ? "Complete!" : fillSubset.length ? `${fillIndex + 1} / ${fillSubset.length}` : "0 / 0"}
                    </span>
                  </div>
                  {fillSubset.length > 0 && !fillDone ? (
                    <div style={{ ...glassCard, padding: "22px 26px", marginBottom: 40 }}>
                      <div style={{ marginBottom: 16 }}>
                        <div style={{
                          fontSize: "1rem", lineHeight: 1.7, fontWeight: 700, color: C.textSub
                        }}>
                          {currentQuestion?.question}
                        </div>
                        <div style={{
                          fontSize: 12, color: "gray", marginTop: 6
                        }}>
                          {currentQuestion?.translation}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap" }}>
                        {fillOptions.map(o => (
                          <QuizBtn key={o} state={fillAnswered[o]} onClick={() => answerFill(o)}>{o}</QuizBtn>
                        ))}
                      </div>
                    </div>
                  ) : <DoneState />}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LearnMode;