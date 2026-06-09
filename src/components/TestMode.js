import { useEffect, useRef, useState } from "react";

const TEST_DURATION = 30 * 60; // 30 minutes in seconds

const formatTime = (secs) => {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const TestMode = ({ onBack }) => {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);

  // "idle" -> not started, "active" -> test running, "completed" -> finished
  const [status, setStatus] = useState("idle");
  const [timeLeft, setTimeLeft] = useState(TEST_DURATION);
  const timerRef = useRef(null);

  const userId = localStorage.getItem("userId");

  useEffect(() => {
    if (!userId) return;

    fetch(`http://localhost:3001/api/user/${userId}/sessions`)
      .then(r => r.json())
      .then(setSessions);
  }, [userId]);

  // Countdown effect: runs while the test is active.
  useEffect(() => {
    if (status !== "active") return;

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setStatus("completed");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [status]);

  // Reset test state whenever a different session is selected.
  const handleSelectSession = (s) => {
    clearInterval(timerRef.current);
    setSelectedSession(s);
    setStatus("idle");
    setTimeLeft(TEST_DURATION);
  };

  const startTest = () => {
    setTimeLeft(TEST_DURATION);
    setStatus("active");
  };

  const submitTest = () => {
    clearInterval(timerRef.current);
    setStatus("completed");
  };

  const vocab = selectedSession?.vocab || [];
  const sentences = selectedSession?.sentences || [];

  const timerLow = timeLeft <= 60;

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      fontFamily: "'Nunito', sans-serif",
      background: "linear-gradient(145deg, #fdf6f0, #f3eeff, #e8f8f5)"
    }}>

      {/* Sidebar */}
      <div style={{
        width: 280,
        padding: 18,
        overflowY: "auto",
        background: "rgba(255,255,255,0.6)",
        borderRight: "2px solid rgba(255,255,255,0.9)",
        backdropFilter: "blur(16px)"
      }}>
        <h3 style={{ fontSize: "0.8rem", color: "#9e8cc0" }}>
          Test Sessions
        </h3>

        {sessions.map(s => (
          <div key={s._id}
            onClick={() => handleSelectSession(s)}
            style={{
              padding: 14,
              marginBottom: 10,
              borderRadius: 16,
              cursor: "pointer",
              background: "rgba(255,255,255,0.7)"
            }}>
            <b>{s.title}</b>
            <div style={{ fontSize: "0.75rem" }}>{s.summary}</div>
          </div>
        ))}
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: 30 }}>

        <button onClick={onBack} style={{
          marginBottom: 16,
          padding: "8px 14px",
          borderRadius: 10,
          border: "none",
          background: "#eee",
          cursor: "pointer",
          fontWeight: 700
        }}>
          ← Back
        </button>

        {!selectedSession ? (
          <p>Select a session</p>
        ) : status === "completed" ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "70%",
            textAlign: "center"
          }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>🎉</div>
            <h2 style={{ color: "#6b4fa0" }}>
              You have completed the assessment.
            </h2>
            <p style={{ fontSize: "1.1rem", color: "#9e8cc0" }}>
              Thank you for participating.
            </p>
          </div>
        ) : status === "idle" ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "70%",
            textAlign: "center"
          }}>
            <h2>🧪 Test Mode</h2>
            <p style={{ color: "#9e8cc0", maxWidth: 420 }}>
              You will have 30 minutes to complete this assessment once you begin.
            </p>
            <button onClick={startTest} style={{
              marginTop: 16,
              padding: "12px 28px",
              borderRadius: 12,
              border: "none",
              background: "#6b4fa0",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: "1rem"
            }}>
              Start Assessment
            </button>
          </div>
        ) : (
          <>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16
            }}>
              <h2 style={{ margin: 0 }}>🧪 Test Mode</h2>

              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  padding: "8px 16px",
                  borderRadius: 12,
                  fontWeight: 800,
                  fontSize: "1.1rem",
                  fontVariantNumeric: "tabular-nums",
                  background: timerLow ? "#ffe2e2" : "rgba(255,255,255,0.7)",
                  color: timerLow ? "#c0392b" : "#6b4fa0"
                }}>
                  ⏱ {formatTime(timeLeft)}
                </div>

                <button onClick={submitTest} style={{
                  padding: "10px 22px",
                  borderRadius: 12,
                  border: "none",
                  background: "#43c59e",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 800
                }}>
                  Submit
                </button>
              </div>
            </div>

            <h3>📚 Vocabulary</h3>
            {vocab.map(v => (
              <div key={v.word}>
                <b>{v.word}</b> → {v.translation}
              </div>
            ))}

            <h3 style={{ marginTop: 20 }}>🧠 Sentences</h3>
            {sentences.map((s, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700 }}>
                  {s.sentence}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#9e8cc0" }}>
                  {s.translation || "No translation"}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default TestMode;
