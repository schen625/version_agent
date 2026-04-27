import { useState, useEffect } from "react";
import ChatWindow from "./ChatWindow";

const LearnMode = ({ mode }) => {
  const [tab, setTab] = useState("chat");
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatHistory, setChatHistory] = useState([]);
  const userId = localStorage.getItem("userId");

  const loadSessions = async () => {
    const res = await fetch(
      `http://localhost:3001/api/user/${userId}/sessions`
    );
    const data = await res.json();
    setSessions(data);
  };

  useEffect(() => {
    if (!userId) return;
    loadSessions();
  }, [userId]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>

      {/* TOP NAV */}
      <div style={{ display: "flex", borderBottom: "1px solid #ccc" }}>
        <button
          onClick={() => setTab("chat")}
          style={{
            flex: 1,
            padding: "15px",
            border: "none",
            cursor: "pointer",
            backgroundColor: tab === "chat" ? "#4caf50" : "#f5f5f5",
            color: tab === "chat" ? "white" : "black",
            fontWeight: "bold",
          }}
        >
          Chat
        </button>

        <button
          onClick={() => setTab("learn")}
          style={{
            flex: 1,
            padding: "15px",
            border: "none",
            cursor: "pointer",
            backgroundColor: tab === "learn" ? "#4caf50" : "#f5f5f5",
            color: tab === "learn" ? "white" : "black",
            fontWeight: "bold",
          }}
        >
          Learn
        </button>
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1 }}>
        {tab === "chat" && (
          <ChatWindow
            mode={mode}
            chatHistory={chatHistory}
            setChatHistory={setChatHistory}
            refreshSessions={loadSessions}
          />
        )}

        {tab === "learn" && (
          <div style={{ display: "flex", height: "100%" }}>

            {/* SIDEBAR */}
            {sidebarOpen && (
              <div style={{
                width: "300px",
                borderRight: "1px solid #ccc",
                padding: "10px",
                overflowY: "auto"
              }}>
                <button onClick={() => setSidebarOpen(false)}>
                  Hide
                </button>

                {sessions.map((s) => (
                  <div
                    key={s._id}
                    onClick={() => setSelectedSession(s)}
                    style={{
                      padding: "15px",
                      marginBottom: "15px",
                      background: "#fff",
                      borderRadius: "10px",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                      cursor: "pointer"
                    }}
                  >
                    <h4>{s.title || "Untitled Session"}</h4>

                    <div>
                      <b>📚 Words:</b>
                      <ul>
                        {s.vocab?.slice(0, 5).map((v, i) => (
                          <li key={i}>
                            {v.word} → {v.translation}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <b>🧠 Sentences:</b>
                      <ul>
                        {s.sentences?.slice(0, 5).map((sen, i) => (
                          <li key={i}>
                            {sen.sentence}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)}>
                Open Sessions
              </button>
            )}

            {/* MAIN CONTENT */}
            <div style={{ flex: 1, padding: "20px" }}>
              {selectedSession ? (
                <>
                  <h2>{selectedSession.title}</h2>

                  <h3>📚 Vocabulary</h3>
                  {selectedSession.vocab?.map((v, i) => (
                    <p key={i}>{v.word} → {v.translation}</p>
                  ))}

                  <h3>🧠 Sentences</h3>
                  {selectedSession.sentences?.map((s, i) => (
                    <p key={i}>{s.sentence}</p>
                  ))}
                </>
              ) : (
                <p>Select a session</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LearnMode;