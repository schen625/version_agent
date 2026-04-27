import { useState } from "react";

const ModePage = ({ onSelectMode }) => {
  const [showTestInput, setShowTestInput] = useState(false);
  const [password, setPassword] = useState("");

  const handleTestAccess = () => {
    if (password === "HCI2026") {
      onSelectMode("test");
    } else {
      alert("Incorrect password");
    }
  };

  return (
    <div
      style={{
        textAlign: "center",
        marginTop: "120px",
        fontFamily: "Arial",
      }}
    >
      <h1>Select Mode</h1>

      {/* LEARN MODE */}
      <button
        style={{
          padding: "12px 20px",
          margin: "10px",
          fontSize: "16px",
          cursor: "pointer",
        }}
        onClick={() => onSelectMode("learn")}
      >
        Learn Mode
      </button>

      {/* TEST MODE */}
      <div style={{ marginTop: "20px" }}>
        <button
          style={{
            padding: "12px 20px",
            fontSize: "16px",
            cursor: "pointer",
          }}
          onClick={() => setShowTestInput(true)}
        >
          Test Mode
        </button>
      </div>

      {/* PASSWORD INPUT */}
      {showTestInput && (
        <div style={{ marginTop: "20px" }}>
          <input
            type="password"
            placeholder="Enter Test Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              padding: "10px",
              marginRight: "10px",
            }}
          />

          <button
            onClick={handleTestAccess}
            style={{
              padding: "10px 15px",
              cursor: "pointer",
            }}
          >
            Enter
          </button>
        </div>
      )}
    </div>
  );
};

export default ModePage;