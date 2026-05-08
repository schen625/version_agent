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
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#fafafa",
        fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
      }}
    >
      {/* Card */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e3f0",
          borderRadius: "16px",
          padding: "40px 48px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
          minWidth: "320px",
          boxShadow: "0 2px 12px rgba(127,119,221,0.07)",
        }}
      >
        <h1
          style={{
            fontSize: "20px",
            fontWeight: "600",
            color: "#1a1a1a",
            marginBottom: "8px",
            letterSpacing: "-0.01em",
          }}
        >
          Select Mode
        </h1>

        {/* Learn Mode */}
        <button
          onClick={() => onSelectMode("learn")}
          style={{
            width: "100%",
            padding: "12px 20px",
            fontSize: "14px",
            fontWeight: "500",
            cursor: "pointer",
            background: "#7F77DD",
            color: "#fff",
            border: "none",
            borderRadius: "10px",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => e.target.style.background = "#6960c8"}
          onMouseLeave={e => e.target.style.background = "#7F77DD"}
        >
          📖 Learn Mode
        </button>

        {/* Test Mode */}
        <button
          onClick={() => setShowTestInput(true)}
          style={{
            width: "100%",
            padding: "12px 20px",
            fontSize: "14px",
            fontWeight: "500",
            cursor: "pointer",
            background: "#f7f6fc",
            color: "#534AB7",
            border: "1px solid #dbd8f5",
            borderRadius: "10px",
            transition: "background 0.15s, border-color 0.15s",
          }}
          onMouseEnter={e => {
            e.target.style.background = "#EEEDFE";
            e.target.style.borderColor = "#AFA9EC";
          }}
          onMouseLeave={e => {
            e.target.style.background = "#f7f6fc";
            e.target.style.borderColor = "#dbd8f5";
          }}
        >
          ✏️ Test Mode
        </button>

        {/* Test Mode Password */}
        {showTestInput && (
          <div
            style={{
              width: "100%",
              marginTop: "4px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <input
              type="password"
              placeholder="Enter test password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTestAccess()}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: "14px",
                border: "1px solid #dbd8f5",
                borderRadius: "10px",
                outline: "none",
                background: "#f7f6fc",
                color: "#1a1a1a",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={handleTestAccess}
              style={{
                width: "100%",
                padding: "10px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer",
                background: "#534AB7",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => e.target.style.background = "#3C3489"}
              onMouseLeave={e => e.target.style.background = "#534AB7"}
            >
              Enter
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModePage;