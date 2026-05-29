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
    🎉 All done — you're amazing!
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
  const [learningPhase, setLearningPhase] = useState("chat");
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  // const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatHistory, setChatHistory] = useState([]);
  // const [sessionActive, setSessionActive] = useState(false);
  const [mcqMistakes, setMcqMistakes] = useState(0);
  const [fillMistakes, setFillMistakes] = useState(0);
  const [mcqOrder, setMcqOrder] = useState([]);
  const [fillOrder, setFillOrder] = useState([]);
  // const [matchOrder, setMatchOrder] = useState([]);

  const [timeLeft, setTimeLeft] = useState(4 * 60);

  const userId = localStorage.getItem("userId");

  const fetchSessions = () => {
    if (!userId) return;
    fetch(`http://localhost:3001/api/user/${userId}/sessions`)
      .then(r => r.json()).then(setSessions);
  };

  useEffect(() => { fetchSessions(); }, [userId]);

  // Timers
  useEffect(() => {
    setLearningPhase("chat");
    setTimeLeft(4 * 60);

    const chatTimer = setTimeout(() => {
      setLearningPhase("study");
      setTimeLeft(4 * 60);
    }, 4 * 60 * 1000);

    const studyTimer = setTimeout(() => {
      setLearningPhase("activities");
      setTimeLeft(0);
    }, 8 * 60 * 1000);

    const countdown = setInterval(() => {
      setTimeLeft(prev => Math.max(prev - 1, 0));
    }, 1000);

    return () => {
      clearTimeout(chatTimer);
      clearTimeout(studyTimer);
      clearInterval(countdown);
    };
  }, []);

  const vocab = useMemo(() => selectedSession?.vocab || [], [selectedSession]);
  const sentences = useMemo(() => selectedSession?.sentences || [], [selectedSession]);

  const resetAll = () => {
    const indices = vocab.map((_, i) => i);

    // setMcqOrder(shuffle(indices));
    // setFillOrder(shuffle(indices));
    // setMatchOrder(shuffle(indices));

    // setMcqIndex(0); setMcqAnswered({}); setMcqDone(false); setMcqMistakes(0);
    // setMatchState({}); setMatchSelected(null); setMatchDone(false);
    // setFillIndex(0); setFillAnswered({}); setFillDone(false); setFillMistakes(0);

    setMcqOrder(shuffle(indices));
    setFillOrder(shuffle(indices));

    setMcqIndex(0);
    setMcqAnswered({});
    setMcqDone(false);
    setMcqMistakes(0);

    setFillIndex(0);
    setFillAnswered({});
    setFillDone(false);
    setFillMistakes(0);
  };

  useEffect(() => { if (selectedSession) resetAll(); }, [selectedSession]);

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
      if (mcqIndex + 1 >= vocab.length) {
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

  // Matching
  /* const [matchSelected, setMatchSelected] = useState(null);
  const [matchState, setMatchState] = useState({});
  const [matchDone, setMatchDone] = useState(false);
  const [leftWords, setLeftWords] = useState([]);
  const [rightWords, setRightWords] = useState([]);

  useEffect(() => {
    if (!vocab.length || !matchOrder.length) {
      setLeftWords([]);
      setRightWords([]);
      return;
    }

    const ordered = matchOrder.map(i => vocab[i]);
    setLeftWords(shuffle(ordered));
    setRightWords(shuffle(ordered));
  }, [matchOrder, vocab]);

  const handleMatch = (word, side) => {
    if (matchState[word] === "correct") return;
    if (!matchSelected) { setMatchSelected({ word, side }); return; }
    const first = matchSelected, second = { word, side };
    if (first.side === second.side) { setMatchSelected(null); return; }
    const left = first.side === "left" ? first : second;
    const right = first.side === "right" ? first : second;
    const correct = vocab.find(v => v.word === left.word)?.translation;
    const isCorrect = correct === right.word;
    setMatchState(p => ({
      ...p, [left.word]: isCorrect ? "correct" : "wrong",
      [right.word]: isCorrect ? "correct" : "wrong",
    }));
    setMatchSelected(null);
    if (isCorrect) {
      const total = Object.values({ ...matchState, [left.word]: "correct", [right.word]: "correct" })
        .filter(v => v === "correct").length;
      if (total / 2 === vocab.length) setMatchDone(true);
    } else {
      setTimeout(() => setMatchState(p => {
        const c = { ...p }; delete c[left.word]; delete c[right.word]; return c;
      }), 600);
    }
  };
 */
  // Fill
  const [fillIndex, setFillIndex] = useState(0);
  const [fillAnswered, setFillAnswered] = useState({});
  const [fillDone, setFillDone] = useState(false);

  useEffect(() => { setFillAnswered({}); }, [fillIndex]);

  const currentFillIndex = fillOrder[fillIndex];
  const fillOptions = useMemo(() => {
    if (!vocab.length) return [];

    const currentIndex = fillOrder[fillIndex];
    const correct = vocab[currentIndex]?.word;

    const wrong = shuffle(
      vocab
        .filter((_, i) => i !== currentIndex)
        .map(v => v.word)
    ).slice(0, 4);

    return shuffle([correct, ...wrong]);
  }, [fillIndex, vocab, fillOrder]);

  const answerFill = (opt) => {
    const currentFillIndex = fillOrder[fillIndex]; 
    const correct = vocab[currentFillIndex]?.word;
    const isCorrect = opt === correct;

    setFillAnswered(p => ({
      ...p,
      [opt]: isCorrect ? "correct" : "wrong"
    }));

    if (!isCorrect) {
      setFillMistakes(m => m + 1);
      return;
    }

    setTimeout(() => {
      if (fillIndex + 1 >= vocab.length) {
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

  const sortedSessions = useMemo(() => {
    return [...sessions].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }, [sessions]);

  useEffect(() => {
    if (!selectedSession && sortedSessions.length > 0 && learningPhase !== "chat") {
      setSelectedSession(sortedSessions[0]);
    }
  }, [sortedSessions, selectedSession, learningPhase]);

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

      {/* Top Navigation (Chat/Learn)
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
      </div> */}

      {/* Content */}
      {learningPhase !== "activities" && (
        <div style={{
          padding: "10px 16px",
          textAlign: "center",
          fontWeight: 800,
          color: C.textMain,
          background: "rgba(255,255,255,0.55)",
          borderBottom: "2px solid rgba(255,255,255,0.9)"
        }}>
          Time remaining: {Math.floor(timeLeft / 60)}:
          {String(timeLeft % 60).padStart(2, "0")}
        </div>
      )}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {learningPhase === "chat" && (
          <ChatWindow
            mode={mode}
            chatHistory={chatHistory}
            setChatHistory={setChatHistory}
            setSessionActiveGlobal={() => {}}
            refreshSessions={fetchSessions}
          />
        )}

        {learningPhase === "study" && (
          <div style={{ display: "flex", height: "100%", position: "relative" }}>
            {/* {!sidebarOpen && (
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
            )} */}

            {/* Left Session Sidebar */}
            {/* {sidebarOpen && (
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
                )} */}

                {/* order sessions */}
                {/* {sortedSessions.map((s) => {
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
            )} */}

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

                  {/* Matching
                  <SectionDivider emoji="🔗" title="Matching" />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <RestartBtn onClick={resetAll} />
                  </div>
                  {!matchDone ? (
                    <div style={{ display: "flex", gap: 20 }}>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                        {leftWords.map(v => {
                          const st = matchState[v.word];
                          const sel = matchSelected?.word === v.word;
                          return (
                            <div key={v.word} onClick={() => handleMatch(v.word, "left")} style={{
                              padding: "11px 18px", borderRadius: 14, cursor: "pointer",
                              pointerEvents: matchState[v.word] === "correct" ? "none" : "auto",
                              fontWeight: 800, fontSize: "0.9rem",
                              background: st === "correct" ? "rgba(181,234,215,0.5)"
                                : st === "wrong" ? "rgba(255,183,197,0.5)"
                                  : sel ? "rgba(201,179,245,0.3)" : "rgba(255,255,255,0.75)",
                              border: `2px solid ${st === "correct" ? "rgba(127,201,169,0.5)"
                                : st === "wrong" ? "rgba(255,143,163,0.5)"
                                  : sel ? "rgba(201,179,245,0.6)" : C.border}`,
                              color: st === "correct" ? "#3a9e75" : st === "wrong" ? "#cc4466" : C.textMain,
                              boxShadow: sel ? "0 4px 14px rgba(201,179,245,0.3)" : "0 2px 8px rgba(180,160,220,0.1)",
                              transition: "all 0.15s",
                            }}>
                              {v.word}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                        {rightWords.map(v => {
                          const st = matchState[v.translation];
                          const sel = matchSelected?.word === v.translation;
                          return (
                            <div key={v.translation} onClick={() => handleMatch(v.translation, "right")} style={{
                              padding: "11px 18px", borderRadius: 14, cursor: "pointer",
                              pointerEvents: matchState[v.translation] === "correct" ? "none" : "auto",
                              fontWeight: 700, fontSize: "0.88rem",
                              background: st === "correct" ? "rgba(181,234,215,0.5)"
                                : st === "wrong" ? "rgba(255,183,197,0.5)"
                                  : sel ? "rgba(168,216,234,0.35)" : "rgba(255,255,255,0.75)",
                              border: `2px solid ${st === "correct" ? "rgba(127,201,169,0.5)"
                                : st === "wrong" ? "rgba(255,143,163,0.5)"
                                  : sel ? "rgba(168,216,234,0.7)" : C.border}`,
                              color: st === "correct" ? "#3a9e75" : st === "wrong" ? "#cc4466" : C.textSub,
                              transition: "all 0.15s",
                            }}>
                              {v.translation}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : <DoneState />} */}

                </>
              )}
            </div>
          </div>
        )}

        {learningPhase === "activities" && (
          <div style={{ flex: 1, padding: "24px 32px", overflowY: "auto" }}>
            {/* MCQ */}
            <SectionDivider emoji="🎯" title="Vocab Quiz" />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <RestartBtn onClick={resetAll} />
              <span style={{ fontSize: "0.78rem", color: C.textMuted, fontWeight: 700 }}>
                {mcqDone ? "Complete!" : `${mcqIndex + 1} / ${vocab.length}`}
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
                    <QuizBtn key={o} state={mcqAnswered[o]} onClick={() => answerMCQ(o)}>
                      {o}
                    </QuizBtn>
                  ))}
                </div>
              </div>
            ) : (
              <DoneState />
            )}

            {/* Fill in The Blank */}
            <SectionDivider emoji="✍️" title="Fill in the Blank" />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <RestartBtn onClick={resetAll} />
              <span style={{ fontSize: "0.78rem", color: C.textMuted, fontWeight: 700 }}>
                {fillDone ? "Complete!" : `${fillIndex + 1} / ${vocab.length}`}
              </span>
            </div>

            {!fillDone ? (
              <div style={{ ...glassCard, padding: "22px 26px", marginBottom: 40 }}>
                <div style={{ margin: "0 0 16px", fontSize: "1rem", lineHeight: 1.7, fontWeight: 700, color: C.textSub }}>
                  {sentences[currentFillIndex]?.sentence?.replace(
                    vocab[currentFillIndex]?.word,
                    "______"
                  )}
                  <p style={{ fontSize: 12, color: "gray" }}>
                    {sentences[currentFillIndex]?.translation}
                  </p>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap" }}>
                  {fillOptions.map(o => (
                    <QuizBtn key={o} state={fillAnswered[o]} onClick={() => answerFill(o)}>
                      {o}
                    </QuizBtn>
                  ))}
                </div>
              </div>
            ) : (
              <DoneState />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LearnMode;