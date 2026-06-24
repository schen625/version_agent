import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import ChatWindow from "./ChatWindow";
import {
  computeReviewWords,
  findSentenceForWord,
} from "../utils/learnReview";

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

// Study phase length: users review the new vocab + sentences for 4 minutes
// before the system automatically moves them to the learning activities.
const STUDY_SECONDS = 4 * 60;

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

const DoneState = ({ onRepeat }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
    background: "rgba(181,234,215,0.35)", border: "2px solid rgba(127,201,169,0.4)",
    borderRadius: 16, padding: "16px 22px", color: "#3a9e75",
    fontWeight: 800, fontSize: "0.92rem",
  }}>
    🎉 All done — you're amazing!
    {onRepeat && (
      <button onClick={onRepeat} style={{
        marginLeft: "auto", padding: "7px 16px", fontSize: "0.8rem",
        fontFamily: "'Nunito', sans-serif", fontWeight: 800, cursor: "pointer",
        color: "#3a9e75", background: "rgba(255,255,255,0.8)",
        border: "2px solid rgba(127,201,169,0.45)", borderRadius: 12,
        transition: "background 0.15s",
      }}
        onMouseEnter={e => e.currentTarget.style.background = "white"}
        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.8)"}
      >
        🔁 Practice again
      </button>
    )}
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

// A compact "Study → Learn → Review" progress indicator shown at the top of the
// main panel so the user always knows where they are in the automated flow.
const PhaseStepper = ({ phase }) => {
  const steps = [
    { key: "study", label: "Study", emoji: "📖" },
    { key: "learn", label: "Learn", emoji: "🎯" },
    { key: "review", label: "Review", emoji: "🔁" },
  ];
  const activeIdx = phase === "done" ? steps.length : steps.findIndex((s) => s.key === phase);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      {steps.map((s, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "6px 14px", borderRadius: 20,
              background: active
                ? "linear-gradient(135deg, #c9b3f5, #a8d8ea)"
                : done ? "rgba(181,234,215,0.5)" : "rgba(255,255,255,0.6)",
              border: `2px solid ${active ? "rgba(201,179,245,0.6)"
                : done ? "rgba(127,201,169,0.45)" : C.border}`,
              color: active ? "white" : done ? "#3a9e75" : C.textMuted,
              fontWeight: 800, fontSize: "0.78rem",
              boxShadow: active ? "0 4px 14px rgba(201,179,245,0.35)" : "none",
              transition: "all 0.2s",
            }}>
              <span>{done ? "✓" : s.emoji}</span>
              <span>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 18, height: 2, background: C.border, borderRadius: 1 }} />
            )}
          </div>
        );
      })}
    </div>
  );
};

// Review activities re-test previously-learned words with the same Vocab Quiz
// (MCQ) + Fill-in-the-Blank exercises used in Learn — 4 old words for the quiz
// and 4 for the fill. Like Learn, attempts are unlimited and a question is
// re-queued (the whole pass restarts) until the user clears it in one shot.
const ReviewActivities = ({ words, recordAttempt, onComplete }) => {
  // MCQ (Vocab Quiz)
  const [mcqOrder, setMcqOrder] = useState([]);
  const [mcqIndex, setMcqIndex] = useState(0);
  const [mcqAnswered, setMcqAnswered] = useState({});
  const [mcqDone, setMcqDone] = useState(false);
  const [mcqWrong, setMcqWrong] = useState([]);

  // Fill
  const [fillOrder, setFillOrder] = useState([]);
  const [fillIndex, setFillIndex] = useState(0);
  const [fillAnswered, setFillAnswered] = useState({});
  const [fillDone, setFillDone] = useState(false);
  const [fillWrong, setFillWrong] = useState([]);

  const resetMcq = () => {
    setMcqOrder(shuffle(words.map((_, i) => i)));
    setMcqIndex(0);
    setMcqAnswered({});
    setMcqDone(false);
    setMcqWrong([]);
  };
  const resetFill = () => {
    setFillOrder(shuffle(words.map((_, i) => i)));
    setFillIndex(0);
    setFillAnswered({});
    setFillDone(false);
    setFillWrong([]);
  };
  const reset = () => { resetMcq(); resetFill(); };

  // Re-initialise whenever the review words change.
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  // The parent is notified via the explicit "Finish" button below (rather than
  // auto-firing when both activities are first cleared) so the user can choose
  // to practice either review activity again before completing.

  useEffect(() => { setMcqAnswered({}); }, [mcqIndex]);
  useEffect(() => { setFillAnswered({}); }, [fillIndex]);

  const currentMcq = words[mcqOrder[mcqIndex]];
  const mcqOptions = useMemo(() => {
    if (!words.length || !currentMcq) return [];
    const correct = currentMcq.translation;
    const wrong = shuffle(
      words.filter((v) => v.translation !== correct).map((v) => v.translation)
    ).slice(0, 4);
    return shuffle([correct, ...wrong]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mcqIndex, mcqOrder, words]);

  const currentFill = words[fillOrder[fillIndex]];
  const fillOptions = useMemo(() => {
    if (!words.length || !currentFill) return [];
    const correct = currentFill.word;
    const wrong = shuffle(
      words.filter((v) => v.word !== correct).map((v) => v.word)
    ).slice(0, 4);
    return shuffle([correct, ...wrong]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillIndex, fillOrder, words]);

  if (!words.length) {
    return (
      <p style={{ color: C.textMuted, fontWeight: 700, fontSize: "0.85rem" }}>
        No previous words to review yet — this looks like your first session.
        Come back after your next chat to review these words! 🌱
      </p>
    );
  }

  const answerMcq = (opt) => {
    const idx = mcqOrder[mcqIndex];
    const correct = currentMcq?.translation;
    const isCorrect = opt === correct;
    recordAttempt(currentMcq?.word, currentMcq?.translation, isCorrect);
    setMcqAnswered((p) => ({ ...p, [opt]: isCorrect ? "correct" : "wrong" }));
    if (!isCorrect) {
      setMcqWrong((w) => (w.includes(idx) ? w : [...w, idx]));
      return;
    }
    setTimeout(() => {
      if (mcqIndex + 1 >= mcqOrder.length) {
        // Re-test ONLY the words missed this round, not the whole set.
        if (mcqWrong.length === 0) setMcqDone(true);
        else { setMcqOrder(shuffle(mcqWrong)); setMcqIndex(0); setMcqWrong([]); setMcqAnswered({}); }
      } else {
        setMcqIndex((i) => i + 1);
      }
    }, 400);
  };

  const answerFill = (opt) => {
    const idx = fillOrder[fillIndex];
    const correct = currentFill?.word;
    const isCorrect = opt === correct;
    recordAttempt(currentFill?.word, currentFill?.translation, isCorrect);
    setFillAnswered((p) => ({ ...p, [opt]: isCorrect ? "correct" : "wrong" }));
    if (!isCorrect) {
      setFillWrong((w) => (w.includes(idx) ? w : [...w, idx]));
      return;
    }
    setTimeout(() => {
      if (fillIndex + 1 >= fillOrder.length) {
        // Re-test ONLY the words missed this round, not the whole set.
        if (fillWrong.length === 0) setFillDone(true);
        else { setFillOrder(shuffle(fillWrong)); setFillIndex(0); setFillWrong([]); setFillAnswered({}); }
      } else {
        setFillIndex((i) => i + 1);
      }
    }, 400);
  };

  const cloze = currentFill?.sentence
    ? currentFill.sentence.replace(currentFill.word, "______")
    : "______";

  return (
    <>
      {/* Vocab Quiz */}
      <SectionDivider emoji="🎯" title="Review · Vocab Quiz" />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <RestartBtn onClick={resetMcq} />
        <span style={{ fontSize: "0.78rem", color: C.textMuted, fontWeight: 700 }}>
          {mcqDone ? "Complete!" : `${mcqIndex + 1} / ${mcqOrder.length}`}
        </span>
      </div>
      {!mcqDone ? (
        <div style={{ ...glassCard, padding: "22px 26px" }}>
          <p style={{ margin: "0 0 16px", fontSize: "1.15rem", fontWeight: 900, color: C.textMain }}>
            {currentMcq?.word}
          </p>
          <p style={{ margin: "0 0 14px", fontSize: "0.82rem", color: C.textMuted, fontWeight: 700 }}>
            Pick the correct translation 👇
          </p>
          <div style={{ display: "flex", flexWrap: "wrap" }}>
            {mcqOptions.map((o) => (
              <QuizBtn key={o} state={mcqAnswered[o]} onClick={() => answerMcq(o)}>{o}</QuizBtn>
            ))}
          </div>
        </div>
      ) : <DoneState onRepeat={resetMcq} />}

      {/* Fill in the Blank */}
      <SectionDivider emoji="✍️" title="Review · Fill in the Blank" />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <RestartBtn onClick={resetFill} />
        <span style={{ fontSize: "0.78rem", color: C.textMuted, fontWeight: 700 }}>
          {fillDone ? "Complete!" : `${fillIndex + 1} / ${fillOrder.length}`}
        </span>
      </div>
      {!fillDone ? (
        <div style={{ ...glassCard, padding: "22px 26px", marginBottom: 40 }}>
          <p style={{ margin: "0 0 16px", fontSize: "1rem", lineHeight: 1.7, fontWeight: 700, color: C.textSub }}>
            {cloze}
            <span style={{ display: "block", fontSize: 12, color: "gray", marginTop: 6 }}>
              {currentFill?.sentenceTranslation || `(${currentFill?.translation})`}
            </span>
          </p>
          <div style={{ display: "flex", flexWrap: "wrap" }}>
            {fillOptions.map((o) => (
              <QuizBtn key={o} state={fillAnswered[o]} onClick={() => answerFill(o)}>{o}</QuizBtn>
            ))}
          </div>
        </div>
      ) : <DoneState onRepeat={resetFill} />}

      {mcqDone && fillDone && (
        <div style={{
          ...glassCard, marginBottom: 40, padding: "22px 26px",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          <p style={{ margin: 0, fontWeight: 800, color: C.textMain, fontSize: "0.95rem" }}>
            🎉 Review complete! Feel free to practice either activity again above, or finish.
          </p>
          <button onClick={() => onComplete?.()} style={{
            alignSelf: "flex-start", padding: "12px 26px", fontSize: "0.92rem",
            fontWeight: 900, fontFamily: "'Nunito', sans-serif", color: "white",
            background: "linear-gradient(135deg, #c9b3f5, #a8d8ea)", border: "none",
            borderRadius: 16, cursor: "pointer", boxShadow: "0 6px 18px rgba(201,179,245,0.45)",
          }}>
            Finish →
          </button>
        </div>
      )}
    </>
  );
};

const LearnMode = ({ mode, onBack }) => {
  const [tab, setTab] = useState("chat");
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatHistory, setChatHistory] = useState([]);
  const [sessionActive, setSessionActive] = useState(false);
  // Session identity is lifted here (not kept inside ChatWindow) so it survives
  // ChatWindow unmounting on tab switches, keeping the chat UI and the
  // Start/End button in sync with chatHistory.
  const [chatSessionId, setChatSessionId] = useState(null);
  const [mcqWrong, setMcqWrong] = useState([]);
  const [fillWrong, setFillWrong] = useState([]);
  const [mcqOrder, setMcqOrder] = useState([]);
  const [fillOrder, setFillOrder] = useState([]);
  const [matchOrder, setMatchOrder] = useState([]);

  // The Learn section runs as an automated sequence per session:
  //   "study"  → review the 4 new vocab + sentences for 4 minutes (timed)
  //   "learn"  → Vocab Quiz + Matching + Fill on the new words (no timer)
  //   "review" → Vocab Quiz + Fill on 4 previously-learned words (no timer)
  // Each phase advances to the next automatically.
  const [phase, setPhase] = useState("study");
  const [studySecondsLeft, setStudySecondsLeft] = useState(STUDY_SECONDS);
  const mainScrollRef = useRef(null);

  const [wordStats, setWordStats] = useState({});
  const [reviewWords, setReviewWords] = useState([]);

  const userId = localStorage.getItem("userId");

  const fetchSessions = useCallback(() => {
    if (!userId) return;
    fetch(`http://localhost:3001/api/user/${userId}/sessions`)
      .then(r => r.json()).then(setSessions);
  }, [userId]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // When a chat session ends, jump straight into the study phase for it.
  const handleSessionEnded = useCallback((session) => {
    fetchSessions();
    setSelectedSession(session);
    setTab("learn");
    // Phase + timer reset is handled by the selectedSession effect below.
  }, [fetchSessions]);

  // Hydrate per-word error stats from the backend.
  useEffect(() => {
    if (!userId) return;
    fetch(`http://localhost:3001/api/user/${userId}/word-stats`)
      .then(r => r.json())
      .then(arr => {
        const map = {};
        (arr || []).forEach(s => {
          map[s.word] = { attempts: s.attempts, errors: s.errors, translation: s.translation };
        });
        setWordStats(map);
      })
      .catch(() => {});
  }, [userId]);

  // Record a practice attempt: update local stats optimistically and persist.
  const recordAttempt = useCallback((word, translation, correct) => {
    if (!word) return;
    setWordStats(prev => {
      const cur = prev[word] || { attempts: 0, errors: 0 };
      return {
        ...prev,
        [word]: {
          attempts: cur.attempts + 1,
          errors: cur.errors + (correct ? 0 : 1),
          translation,
        },
      };
    });
    if (userId) {
      fetch(`http://localhost:3001/api/user/${userId}/word-stats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, translation, correct }),
      }).catch(() => {});
    }
  }, [userId]);

  const vocab = useMemo(() => {
    const seen = new Set();
    return (selectedSession?.vocab || []).filter((v) => {
      if (!v?.word || seen.has(v.word)) return false;
      seen.add(v.word);
      return true;
    });
  }, [selectedSession]);
  const sentences = useMemo(() => selectedSession?.sentences || [], [selectedSession]);

  const resetAll = useCallback(() => {
    const indices = vocab.map((_, i) => i);

    setMcqOrder(shuffle(indices));
    setFillOrder(shuffle(indices));
    setMatchOrder(shuffle(indices));

    setMcqIndex(0); setMcqAnswered({}); setMcqDone(false); setMcqWrong([]);
    setMatchState({}); setMatchSelected(null); setMatchDone(false);
    setFillIndex(0); setFillAnswered({}); setFillDone(false); setFillWrong([]);
  }, [vocab]);

  // Per-activity resets so a user can voluntarily "practice again" one activity
  // (Vocab Quiz, Matching, or Fill) without wiping the other two. Re-answering
  // still records attempts, so any extra practice is logged like normal play.
  const resetMCQ = useCallback(() => {
    setMcqOrder(shuffle(vocab.map((_, i) => i)));
    setMcqIndex(0); setMcqAnswered({}); setMcqDone(false); setMcqWrong([]);
  }, [vocab]);
  const resetMatching = useCallback(() => {
    setMatchOrder(shuffle(vocab.map((_, i) => i)));
    setMatchState({}); setMatchSelected(null); setMatchDone(false);
  }, [vocab]);
  const resetFill = useCallback(() => {
    setFillOrder(shuffle(vocab.map((_, i) => i)));
    setFillIndex(0); setFillAnswered({}); setFillDone(false); setFillWrong([]);
  }, [vocab]);

  // Restart the automated flow at the timed study phase. Used both when a new
  // session is selected and by the "back to study" control.
  const goToStudy = useCallback(() => {
    resetAll();
    setStudySecondsLeft(STUDY_SECONDS);
    setPhase("study");
  }, [resetAll]);

  // Re-enter the learn activities from review. Reset first so the activity-done
  // flags clear — otherwise the auto-advance effect would bounce straight back
  // to review.
  const goToLearn = useCallback(() => {
    resetAll();
    setPhase("learn");
  }, [resetAll]);

  useEffect(() => {
    if (selectedSession) goToStudy();
  }, [selectedSession, goToStudy]);

  // Study-phase countdown: tick once a second and, when it hits zero,
  // automatically move the user into the learning activities.
  useEffect(() => {
    if (phase !== "study" || !selectedSession) return;
    if (studySecondsLeft <= 0) { setPhase("learn"); return; }
    const t = setTimeout(() => setStudySecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, studySecondsLeft, selectedSession]);

  // Snapshot the 4 review words when the user enters the review phase so the
  // set stays stable while they practice (rather than reshuffling each answer).
  useEffect(() => {
    if (phase === "review") {
      const rw = computeReviewWords(selectedSession, sessions, wordStats);
      setReviewWords(rw);
      // First session has no prior words to review, so go straight to "done".
      if (rw.length === 0) setPhase("done");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, selectedSession]);

  // Scroll the main panel back to the top on each phase transition so a new
  // phase always starts in view.
  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [phase]);

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

    recordAttempt(vocab[currentMCQIndex]?.word, vocab[currentMCQIndex]?.translation, isCorrect);

    setMcqAnswered(p => ({
      ...p,
      [opt]: isCorrect ? "correct" : "wrong"
    }));

    if (!isCorrect) {
      setMcqWrong(w => w.includes(currentMCQIndex) ? w : [...w, currentMCQIndex]);
      return;
    }

    setTimeout(() => {
      if (mcqIndex + 1 >= mcqOrder.length) {
        // Repeat ONLY the words missed this round, not the whole set.
        if (mcqWrong.length === 0) {
          setMcqDone(true); 
        } else {
          setMcqOrder(shuffle(mcqWrong));
          setMcqIndex(0);
          setMcqWrong([]);
          setMcqAnswered({});
        }
      } else {
        setMcqIndex(i => i + 1);
      }
    }, 400);
  };

  // Matching
  const [matchSelected, setMatchSelected] = useState(null);
  const [matchState, setMatchState] = useState({});
  const [matchDone, setMatchDone] = useState(false);
  const [leftWords, setLeftWords] = useState([]);
  const [rightWords, setRightWords] = useState([]);

  useEffect(() => {
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
    recordAttempt(left.word, correct, isCorrect);
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

  // Build the cloze from a sentence that actually CONTAINS the target word.
  // The backend now aligns each word with such a sentence, but we still resolve
  // it here (rather than trusting sentences[i]) so older / misaligned sessions
  // also work. If no sentence contains the word, fall back to a bare blank with
  // the translation as the clue so the question stays answerable.
  const currentFillVocab = vocab[currentFillIndex];
  const currentFillSentence = currentFillVocab
    ? findSentenceForWord(currentFillVocab.word, selectedSession, sessions)
    : { sentence: null, translation: null };
  const currentFillCloze = currentFillSentence.sentence
    ? currentFillSentence.sentence.replace(currentFillVocab.word, "______")
    : "______";
  const currentFillClue = currentFillSentence.translation
    || (currentFillVocab ? `(${currentFillVocab.translation})` : "");

  const answerFill = (opt) => {
    const currentFillIndex = fillOrder[fillIndex];
    const correct = vocab[currentFillIndex]?.word;
    const isCorrect = opt === correct;

    recordAttempt(vocab[currentFillIndex]?.word, vocab[currentFillIndex]?.translation, isCorrect);

    setFillAnswered(p => ({
      ...p,
      [opt]: isCorrect ? "correct" : "wrong"
    }));

    if (!isCorrect) {
      setFillWrong(w => w.includes(currentFillIndex) ? w : [...w, currentFillIndex]);
      return;
    }

    setTimeout(() => {
      if (fillIndex + 1 >= fillOrder.length) {
        // Repeat ONLY the words missed this round, not the whole set.
        if (fillWrong.length === 0) {
          setFillDone(true);
        } else {
          setFillOrder(shuffle(fillWrong));
          setFillIndex(0);
          setFillWrong([]);
          setFillAnswered({});
        }
      } else {
        setFillIndex(i => i + 1);
      }
    }, 400);
  };

  // We DON'T auto-advance when all activities are cleared anymore: a completion
  // panel (below) offers a "Continue to Review" button so the user can choose to
  // practice any activity again first. The only automatic jump is for a session
  // with no vocab (e.g. summary generation failed), which has nothing to drill.
  useEffect(() => {
    if (phase !== "learn") return;
    if (vocab.length === 0) setPhase("review");
  }, [phase, vocab.length]);

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  const studyMinutes = Math.floor(studySecondsLeft / 60);
  const studySecs = String(studySecondsLeft % 60).padStart(2, "0");

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
        alignItems: "stretch",
        background: "rgba(255,255,255,0.65)",
        backdropFilter: "blur(16px)",
        borderBottom: "2px solid rgba(255,255,255,0.9)",
        boxShadow: "0 2px 12px rgba(180,160,220,0.1)",
      }}>
        {/* Back to mode selection */}
        {onBack && (
          <button
            onClick={onBack}
            title="Back to mode selection"
            style={{
              padding: "0 18px",
              background: "none",
              border: "none",
              borderRight: `1.5px solid rgba(201,179,245,0.2)`,
              borderBottom: "3px solid transparent",
              color: C.textMuted,
              fontSize: "0.82rem",
              fontWeight: 800,
              fontFamily: "'Nunito', sans-serif",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              transition: "color 0.15s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={e => e.currentTarget.style.color = C.textSub}
            onMouseLeave={e => e.currentTarget.style.color = C.textMuted}
          >
            ← Mode
          </button>
        )}

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
            sessionId={chatSessionId}
            setSessionId={setChatSessionId}
            sessionActive={sessionActive}
            setSessionActive={setSessionActive}
            refreshSessions={fetchSessions}
            onSessionEnded={handleSessionEnded}
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
            <div ref={mainScrollRef} style={{ flex: 1, padding: "24px 32px", overflowY: "auto" }}>
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
                  {/* Phase progress: Study → Learn → Review */}
                  <PhaseStepper phase={phase} />

                  {/* ── STUDY PHASE: vocab + sentences, on a 4-minute timer ── */}
                  {phase === "study" && (
                    <>
                      {/* Countdown card — auto-advances to the activities at 0 */}
                      <div style={{
                        ...glassCard, padding: "18px 22px", marginBottom: 6,
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        gap: 16, flexWrap: "wrap",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <div style={{
                            minWidth: 84, textAlign: "center",
                            fontSize: "1.6rem", fontWeight: 900,
                            color: studySecondsLeft <= 30 ? C.red : C.textMain,
                            fontVariantNumeric: "tabular-nums",
                          }}>
                            {studyMinutes}:{studySecs}
                          </div>
                          <div>
                            <p style={{ margin: 0, fontWeight: 800, color: C.textMain, fontSize: "0.92rem" }}>
                              Study time
                            </p>
                            <p style={{ margin: "2px 0 0", fontWeight: 700, color: C.textMuted, fontSize: "0.78rem" }}>
                              Review the new words & sentences — activities start automatically.
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setPhase("learn")}
                          style={{
                            padding: "12px 26px", fontSize: "0.92rem", fontWeight: 900,
                            fontFamily: "'Nunito', sans-serif",
                            background: "linear-gradient(135deg, #c9b3f5, #a8d8ea)",
                            color: "white", border: "none", borderRadius: 16, cursor: "pointer",
                            boxShadow: "0 6px 18px rgba(201,179,245,0.45)",
                            transition: "transform 0.15s, box-shadow 0.15s",
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.transform = "translateY(-2px)";
                            e.currentTarget.style.boxShadow = "0 10px 26px rgba(201,179,245,0.55)";
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = "0 6px 18px rgba(201,179,245,0.45)";
                          }}
                        >
                          I'm ready →
                        </button>
                      </div>

                      {/* List Vocab */}
                      {vocab.length > 0 && (
                        <>
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
                        </>
                      )}

                      {/* Sentences */}
                      {sentences.length > 0 && (
                        <>
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
                        </>
                      )}

                      <div style={{ height: 24 }} />
                    </>
                  )}

                  {/* ── LEARN PHASE: Vocab Quiz + Matching + Fill (no timer) ── */}
                  {phase === "learn" && (
                    <>
                      {/* Back to study link */}
                      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                        <button
                          onClick={goToStudy}
                          style={{
                            background: "none",
                            border: "none",
                            color: C.textMuted,
                            fontSize: "0.78rem",
                            fontWeight: 800,
                            fontFamily: "'Nunito', sans-serif",
                            cursor: "pointer",
                            padding: "4px 0",
                            transition: "color 0.15s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = C.textSub}
                          onMouseLeave={e => e.currentTarget.style.color = C.textMuted}
                        >
                          ← Back to study material
                        </button>
                      </div>

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
                      ) : <DoneState onRepeat={resetMCQ} />}

                      {/* Matching */}
                      <SectionDivider emoji="🔗" title="Matching" />
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                        <RestartBtn onClick={resetMatching} />
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
                      ) : <DoneState onRepeat={resetMatching} />}

                      {/* Fill in The Blank */}
                      <SectionDivider emoji="✍️" title="Fill in the Blank" />
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                        <RestartBtn onClick={resetFill} />
                        <span style={{ fontSize: "0.78rem", color: C.textMuted, fontWeight: 700 }}>
                          {fillDone ? "Complete!" : `${fillIndex + 1} / ${fillOrder.length}`}
                        </span>
                      </div>
                      {!fillDone ? (
                        <div style={{ ...glassCard, padding: "22px 26px", marginBottom: 40 }}>
                          <p style={{ margin: "0 0 16px", fontSize: "1rem", lineHeight: 1.7, fontWeight: 700, color: C.textSub }}>
                            {currentFillCloze}
                            <span style={{ display: "block", fontSize: 12, color: "gray", marginTop: 6 }}>
                              {currentFillClue}
                            </span>
                          </p>
                          <div style={{ display: "flex", flexWrap: "wrap" }}>
                            {fillOptions.map(o => (
                              <QuizBtn key={o} state={fillAnswered[o]} onClick={() => answerFill(o)}>{o}</QuizBtn>
                            ))}
                          </div>
                        </div>
                      ) : <DoneState onRepeat={resetFill} />}

                      {/* When every activity is cleared, show a completion gate
                          with a "Continue to Review" button. We no longer auto-
                          advance, so users can choose to practice again first. */}
                      {mcqDone && matchDone && fillDone ? (
                        <div style={{
                          ...glassCard, margin: "8px 0 36px", padding: "22px 26px",
                          display: "flex", flexDirection: "column", gap: 14,
                        }}>
                          <p style={{ margin: 0, fontWeight: 800, color: C.textMain, fontSize: "0.95rem" }}>
                            🎉 Nice work — all activities cleared! Practice any of them again
                            above if you'd like, or continue to your Review.
                          </p>
                          <button
                            onClick={() => setPhase("review")}
                            style={{
                              alignSelf: "flex-start", padding: "12px 26px",
                              fontSize: "0.92rem", fontWeight: 900, fontFamily: "'Nunito', sans-serif",
                              color: "white", background: "linear-gradient(135deg, #c9b3f5, #a8d8ea)",
                              border: "none", borderRadius: 16, cursor: "pointer",
                              boxShadow: "0 6px 18px rgba(201,179,245,0.45)",
                            }}
                          >
                            Continue to Review →
                          </button>
                        </div>
                      ) : (
                        <p style={{
                          margin: "8px 0 30px", fontSize: "0.8rem",
                          color: C.textMuted, fontWeight: 700, lineHeight: 1.5,
                        }}>
                          Missed words come back until you clear them — then you can repeat any activity or move on 🔁
                        </p>
                      )}
                    </>
                  )}

                  {/* ── REVIEW PHASE: 4 previously-learned words (no timer) ── */}
                  {phase === "review" && (
                    <>
                      {/* Back to activities link (resets so it doesn't bounce back) */}
                      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                        <button
                          onClick={goToLearn}
                          style={{
                            background: "none", border: "none", color: C.textMuted,
                            fontSize: "0.78rem", fontWeight: 800,
                            fontFamily: "'Nunito', sans-serif", cursor: "pointer",
                            padding: "4px 0", transition: "color 0.15s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = C.textSub}
                          onMouseLeave={e => e.currentTarget.style.color = C.textMuted}
                        >
                          ← Back to activities
                        </button>
                      </div>

                      <SectionDivider emoji="🔁" title="Review" />
                      <p style={{
                        margin: "0 0 16px", fontSize: "0.82rem",
                        color: C.textMuted, fontWeight: 700, lineHeight: 1.5,
                      }}>
                        {reviewWords.length > 0
                          ? "Revisiting " + reviewWords.length + " word" + (reviewWords.length === 1 ? "" : "s") + " from earlier sessions — your trickiest (highest error rate) and least-seen (lowest frequency)."
                          : "Words you've learned in earlier sessions show up here for review."}
                      </p>
                      <ReviewActivities words={reviewWords} recordAttempt={recordAttempt} onComplete={() => setPhase("done")} />
                    </>
                  )}

                  {/* ── DONE: end-of-day completion screen ── */}
                  {phase === "done" && (
                    <div style={{
                      minHeight: "70vh", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", textAlign: "center",
                      gap: 20,
                    }}>
                      <div style={{ fontSize: 72 }}>🎉</div>
                      <div style={{
                        ...glassCard, padding: "34px 42px", maxWidth: 560,
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
                      }}>
                        <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 900, color: C.textMain }}>
                          Nice job!
                        </h2>
                        <p style={{ margin: 0, fontSize: "1.02rem", lineHeight: 1.7, fontWeight: 700, color: C.textSub }}>
                          You have completed your learning activity today. Please let the
                          researcher know and we look forward to your learning tomorrow!
                        </p>
                      </div>
                    </div>
                  )}
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
