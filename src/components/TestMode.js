import { useEffect, useState } from "react";

const TestMode = ({ onBack }) => {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);

  const userId = localStorage.getItem("userId");

  useEffect(() => {
    if (!userId) return;

    fetch(`http://localhost:3001/api/user/${userId}/sessions`)
      .then(r => r.json())
      .then(setSessions);
  }, [userId]);

  const vocab = selectedSession?.vocab || [];
  const sentences = selectedSession?.sentences || [];

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
            onClick={() => setSelectedSession(s)}
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
        ) : (
          <>
            <h2>🧪 Test Mode</h2>

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