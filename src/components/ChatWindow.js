import { useState } from "react";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";

import ChatMessage from "./ChatMessage";
import LanguageSelector from "./LanguageSelector";
import { sendMessage } from "../api/chat";
import avatar from "../assets/user-avatar.png";

const ChatWindow = ({ mode, chatHistory, setChatHistory, refreshSessions }) => {
  const [sessionId, setSessionId] = useState(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [translateFrom, setTranslateFrom] = useState("auto");
  const [translateTo, setTranslateTo] = useState("en");

  const { transcript, resetTranscript, listening } =
    useSpeechRecognition();

  if (!SpeechRecognition.browserSupportsSpeechRecognition()) {
    return <p>Browser does not support speech recognition.</p>;
  }

  const startSession = async () => {
    const res = await fetch("http://localhost:3001/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: localStorage.getItem("userId"),
        mode,
      }),
    });

    const data = await res.json();
    setSessionId(data._id);
    setSessionActive(true);
    setChatHistory([]);
  };

  const handleSendVoiceMessage = async () => {
    setRecording(false);
    const userMessage = transcript.trim();
    resetTranscript();

    if (!userMessage) return;
    if (!sessionActive) {
      alert("Start session first");
      return;
    }

    try {
      const res = await sendMessage({
        sessionId,
        message: userMessage,
        translateFrom,
        translateTo,
        mode,
      });

      if (mode === "learn") {
        setChatHistory((prev) => [
          ...prev,
          {
            role: "user",
            original: userMessage,
            translated: res.user.translated, // translated: res.translatedUserMessage
          },
          {
            role: "agent",
            original: res.agent.original, // original: res.agentReplyOriginal
            translated: res.agent.translated, // translated: res.agentReplyTranslated
          },
        ]);
      }

      if (mode === "test") {
        setChatHistory((prev) => [
          ...prev,
          {
            role: "user",
            original: userMessage,
            translated: null,
          },
          {
            role: "agent",
            original: res.agentReplyOriginal,
            translated: null,
          },
        ]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const endSession = async () => {
    SpeechRecognition.stopListening();
    setRecording(false);

    await fetch("http://localhost:3001/api/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    setSessionActive(false);
    setSessionId(null);
    setChatHistory([]);
    refreshSessions();
  };

  const toggleListening = () => {
    if (!sessionActive) {
      alert("Session must be started first");
      return;
    }

    if (listening) {
      setRecording(false);
      SpeechRecognition.stopListening();
      handleSendVoiceMessage();
    } else {
      setRecording(true);

      SpeechRecognition.startListening({
        continuous: true,
        language: "en-US",
      });
    }
  };

  return (
    <div style={{ display: "flex", height: "100%", width: "100%" }}>

      {/* LEFT PANEL */}
      <div style={{ width: "20%", background: "#f5f5f5", padding: "20px" }}>

        <img src={avatar} alt="User avatar" style={{ width: 70, borderRadius: "50%" }} />

        {/* SESSION BUTTONS */}
        <button
          onClick={sessionActive ? endSession : startSession}
          style={{
            marginTop: 20,
            padding: "12px",
            width: "100%",
            background: sessionActive ? "red" : "black",
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
        >
          {sessionActive ? "End Session ⏹" : "Start Session ▶"}
        </button>

        <button
          onClick={toggleListening}
          disabled={!sessionActive}
          style={{
            marginTop: 20,
            padding: "15px",
            borderRadius: "50%",
            background: !sessionActive
              ? "#999"
              : recording
                ? "red"
                : "green",
            color: "white",
            border: "none",
            cursor: !sessionActive ? "not-allowed" : "pointer",
            width: "70px",
            height: "70px",
            opacity: !sessionActive ? 0.5 : 1,
          }}
        >
          {!sessionActive ? "🔒" : recording ? "⏹" : "🎤"}
        </button>

        <p>Mode: {mode}</p>
      </div>

      {/* RIGHT PANEL */}
      <div style={{ width: "80%", padding: "20px" }}>

        <LanguageSelector
          translateFrom={translateFrom}
          translateTo={translateTo}
          setTranslateFrom={setTranslateFrom}
          setTranslateTo={setTranslateTo}
        />

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            border: "1px solid #ccc",
            padding: 10,
          }}
        >
          {chatHistory.map((msg, idx) => (
            <ChatMessage key={idx}
              role={msg.role}
              original={msg.original}
              translated={msg.translated} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;