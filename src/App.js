import { useState } from "react";
import Auth from "./components/Auth";
import ModePage from "./components/ModePage";
import LearnMode from "./components/LearnMode";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [mode, setMode] = useState(null);

  if (!loggedIn) {
    return <Auth onLogin={() => setLoggedIn(true)} />;
  }

  if (!mode) {
    return <ModePage onSelectMode={setMode} />;
  }

  return (
    <div>
      {mode === "learn" && <LearnMode mode={mode} />}

      {mode === "test" && (
        <div>
          <h1>Test Mode 🧠</h1>
        </div>
      )}
    </div>
  );
}