import { useState, useRef, useEffect } from "react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import ChatMessage from "./ChatMessage";
import LanguageSelector from "./LanguageSelector";
import { sendMessage } from "./Chat.js";
import avatar from "../assets/user-avatar.png";

//Sessions
const ChatWindow = ({ mode, chatHistory, setChatHistory, refreshSessions, setSessionActiveGlobal }) => {
  const [sessionId, setSessionId] = useState(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [translateFrom, setTranslateFrom] = useState("");
  const [translateTo, setTranslateTo] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const messagesEndRef = useRef(null);
  const { transcript, resetTranscript, listening } = useSpeechRecognition();

  //timer 
  useEffect(() => {
    let interval;

    if (sessionActive) {
      interval = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [sessionActive]);

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const seconds = secs % 60;

    return `${String(mins).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  if (!SpeechRecognition.browserSupportsSpeechRecognition()) {
    return <p style={{ padding: 20, color: "#9178cc" }}>Browser does not support speech recognition.</p>;
  }

  //Audio Code
  const getVoiceForLang = (langCode) => {
    const voices = speechSynthesis.getVoices();

    return (
      voices.find(v => v.lang === langCode) ||
      voices.find(v => v.lang.startsWith(langCode.split("-")[0])) ||
      voices[0]
    );
  };

  const speakText = (text, lang = "en-US") => {
    const utterance = new SpeechSynthesisUtterance(text);

    const voice = getVoiceForLang(lang);
    if (voice) utterance.voice = voice;

    utterance.lang = lang;
    utterance.rate = 1;
    utterance.pitch = 1;

    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  };

  const getLangCode = (lang) => {
    const map = {
      en: "en-US",
      es: "es-ES",
      zh: "cmn-Hans-CN",
    };

    return map[lang] || "en-US";
  };

  const startSession = async () => {
    if (!translateFrom || !translateTo || translateTo === "auto" || translateFrom === "auto") {
      alert("Please select both languages."); return;
    }
    const res = await fetch("http://localhost:3001/api/session/start", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: localStorage.getItem("userId"), mode }),
    });
    const data = await res.json();
    setSessionId(data._id); setSessionActive(true);
    setSessionActiveGlobal(true); setChatHistory([]);
    setElapsedSeconds(0);
  };

  const handleSendVoiceMessage = async () => {
    const userMessage = transcript.trim();
    if (!userMessage) return;
    resetTranscript(); setRecording(false);
    if (!sessionActive) { alert("Start session first"); return; }
    try {
      const res = await sendMessage({ sessionId, message: userMessage, translateFrom, translateTo, mode });
      speakText(res.agent.original, getLangCode(translateTo));
      if (mode === "learn") {
        setChatHistory((prev) => [...prev,
        { role: "user", original: userMessage, translated: res.user.translated },
        { role: "agent", original: res.agent.original, translated: res.agent.translated },
        ]);
      }
      if (mode === "test") {
        setChatHistory((prev) => [...prev,
        { role: "user", original: userMessage, translated: null },
        { role: "agent", original: res.agent.original, translated: null },
        ]);
      }
    } catch (err) { console.error(err); }
  };

  const endSession = async () => {
    SpeechRecognition.stopListening(); setRecording(false);
    await fetch("http://localhost:3001/api/session/end", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    setSessionActive(false); setSessionId(null);
    setSessionActiveGlobal(false); setChatHistory([]);
    setElapsedSeconds(0);
    refreshSessions();
  };

  const toggleListening = () => {
    if (!sessionActive) return alert("Start session first");

    if (listening) {
      setRecording(false);
      SpeechRecognition.stopListening();

      setTimeout(() => {
        handleSendVoiceMessage();
      }, 300);
    } else {
      if (!translateFrom) {
        alert("Select a source language first");
        return;
      }

      resetTranscript();
      setRecording(true);

      SpeechRecognition.startListening({
        continuous: true,
        language: getLangCode(translateFrom),
      });
    }
  };

  return (
    <div style={{
      display: "flex", height: "100%", width: "100%",
      fontFamily: "'Nunito', 'Segoe UI', sans-serif",
      background: "linear-gradient(145deg, #fdf6f0, #f3eeff, #e8f8f5)",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        .session-btn {
          width: 100%; padding: 13px; border: none; border-radius: 18px;
          font-family: 'Nunito', sans-serif; font-size: 0.9rem; font-weight: 800;
          cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;
          letter-spacing: 0.2px;
        }
        .session-btn:hover { transform: translateY(-2px); }
        .mic-btn {
          width: 76px; height: 76px; border-radius: 50%; border: none;
          font-size: 28px; cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          display: flex; align-items: center; justify-content: center;
        }
        .mic-btn:hover:not(:disabled) { transform: scale(1.08); }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(201,179,245,0.35); border-radius: 4px; }
      `}</style>

      {/* Left Sidebar */}
      <div style={{
        width: 210, flexShrink: 0,
        background: "rgba(255,255,255,0.6)",
        backdropFilter: "blur(16px)",
        borderRight: "2px solid rgba(255,255,255,0.9)",
        padding: "28px 18px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 18,
        boxShadow: "4px 0 24px rgba(201,179,245,0.1)",
      }}>
        {/* Avatar */}
        <div style={{
          width: 76, height: 76, borderRadius: "50%",
          background: "linear-gradient(135deg, #f9c6d0, #c9b3f5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 30, border: "3px solid white",
          boxShadow: "0 6px 20px rgba(201,179,245,0.4)",
          overflow: "hidden",
        }}>
          <img src={avatar} alt="avatar"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={e => { e.target.style.display = "none"; }} />
        </div>

        {/* Mode badge */}
        <div style={{
          padding: "5px 14px", borderRadius: 24,
          background: mode === "learn"
            ? "rgba(181,234,215,0.5)" : "rgba(255,183,197,0.5)",
          border: `2px solid ${mode === "learn" ? "rgba(100,200,150,0.4)" : "rgba(255,150,170,0.4)"}`,
          color: mode === "learn" ? "#3a9e75" : "#cc5575",
          fontSize: "0.75rem", fontWeight: 800, letterSpacing: "0.8px",
          textTransform: "uppercase",
        }}>
          {mode === "learn" ? "Mode: 🌱 Learn" : "Mode: 🎯 Test"}
        </div>

        <div style={{
          padding: "8px 14px",
          borderRadius: 14,
          background: "rgba(255,255,255,0.65)",
          border: "1.5px solid rgba(201,179,245,0.3)",
          color: "#7a5faa",
          fontWeight: 800,
          fontSize: "0.85rem"
        }}>
          ⏱ {formatTime(elapsedSeconds)}
        </div>

        {/* Session button */}
        <button className="session-btn" onClick={sessionActive ? endSession : startSession} style={{
          background: sessionActive
            ? "linear-gradient(135deg, #ffb7c5, #ff8fa3)"
            : "linear-gradient(135deg, #c9b3f5, #a8d8ea)",
          color: "white",
          boxShadow: sessionActive
            ? "0 6px 18px rgba(255,150,170,0.45)"
            : "0 6px 18px rgba(201,179,245,0.45)",
        }}>
          {sessionActive ? "⏹ End Session" : "▶ Start"}
        </button>

        {/* Mic */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <button className="mic-btn" onClick={toggleListening} disabled={!sessionActive} style={{
            background: !sessionActive
              ? "rgba(230,220,245,0.5)"
              : recording
                ? "linear-gradient(135deg, #ffb7c5, #ff8fa3)"
                : "linear-gradient(135deg, #b5ead7, #7fc9a9)",
            color: !sessionActive ? "#cbbde8" : "white",
            boxShadow: !sessionActive ? "none"
              : recording
                ? "0 0 0 8px rgba(255,183,197,0.25), 0 8px 24px rgba(255,150,170,0.4)"
                : "0 8px 24px rgba(100,200,150,0.4)",
            cursor: !sessionActive ? "not-allowed" : "pointer",
          }}>
            {!sessionActive ? "🔒" : recording ? "⏹" : "🎤"}
          </button>
          <span style={{
            fontSize: "0.73rem", fontWeight: 700,
            color: recording ? "#e07090" : "#b8a8d8",
            letterSpacing: "0.3px",
          }}>
            {recording ? "Recording…" : !sessionActive ? "Start a session first" : "Tap to speak"}
          </span>
        </div>

        {/* Live transcript */}
        {recording && transcript && (
          <div style={{
            background: "rgba(255,255,255,0.7)", border: "1.5px solid rgba(201,179,245,0.4)",
            borderRadius: 12, padding: "10px 12px", width: "100%", boxSizing: "border-box",
          }}>
            <p style={{ margin: 0, fontSize: "0.76rem", color: "#9e8cc0", lineHeight: 1.5, fontWeight: 600 }}>
              {transcript}
            </p>
          </div>
        )}
      </div>

      {/* Right Panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Language selector */}
        <div style={{
          padding: "14px 24px",
          background: "rgba(255,255,255,0.5)",
          backdropFilter: "blur(12px)",
          borderBottom: "2px solid rgba(255,255,255,0.8)",
        }}>
          <LanguageSelector
            translateFrom={translateFrom} translateTo={translateTo}
            setTranslateFrom={setTranslateFrom} setTranslateTo={setTranslateTo}
          />
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column" }}>
          {chatHistory.length === 0 ? (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 14, color: "#c4b0de",
            }}>
              <div style={{ fontSize: 56 }}>💬</div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem" }}>
                {sessionActive ? "Tap the mic and start speaking!" : "Start a session to begin ✨"}
              </p>
            </div>
          ) : (
            chatHistory.map((msg, idx) => (
              <ChatMessage
                key={idx}
                role={msg.role}
                original={msg.original}
                translated={msg.translated}
                originalLang={getLangCode(
                  msg.role === "user" ? translateFrom : translateTo
                )}
                translatedLang={getLangCode(
                  msg.role === "user" ? translateTo : translateFrom
                )}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;