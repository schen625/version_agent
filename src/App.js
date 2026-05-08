import { useState, useEffect } from "react";
import Auth from "./components/Auth";
import ModePage from "./components/ModePage";
import LearnMode from "./components/LearnMode";
import TestMode from "./components/TestMode";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mode, setMode] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) setIsAuthenticated(true);
  }, []);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
    setMode(null);
  };

  // AUTH
  if (!isAuthenticated) {
    return <Auth onLogin={handleLogin} />;
  }

  // MODE SELECT
  if (!mode) {
    return (
      <div style={{ position: "relative" }}>
        <button
          onClick={handleLogout}
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            padding: "8px 14px",
            borderRadius: 10,
            border: "none",
            background: "#eee",
            cursor: "pointer",
            fontWeight: 700,
            zIndex: 10
          }}
        >
          Logout
        </button>

        <ModePage onSelectMode={setMode} />
      </div>
    );
  }

  if (mode === "learn") {
    return <LearnMode mode="learn" onBack={() => setMode(null)} />;
  }

  if (mode === "test") {
    return <TestMode onBack={() => setMode(null)} />;
  }

  return null;
}

export default App;