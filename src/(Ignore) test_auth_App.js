import { useState } from "react";
import Auth from "./components/Auth";
import ChatWindow from "./components/ChatWindow";

function App() {
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem("token"));

  return (
    <div style={{ height: "100vh" }}>
      {loggedIn
        ? <ChatWindow />
        : <Auth onLogin={() => setLoggedIn(true)} />}
    </div>
  );
}

export default App;