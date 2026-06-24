import { useState, useRef, useEffect } from "react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import ChatMessage from "./ChatMessage";
import LanguageSelector from "./LanguageSelector";
import { sendMessage, requestNudge } from "../api/chat";
import avatar from "../assets/user-avatar.png";

const NUDGE_DELAY_MS = 30000;
const MAX_NUDGES = 3;

//Sessions
const ChatWindow = ({
  mode,
  chatHistory,
  setChatHistory,
  refreshSessions,
  sessionId,
  setSessionId,
  sessionActive,
  setSessionActive,
  onSessionEnded,
}) => {
  const [recording, setRecording] = useState(false);
  const [translateFrom, setTranslateFrom] = useState("en");
  const [translateTo, setTranslateTo] = useState("zh");
  const messagesEndRef = useRef(null);

  // Idle-nudge state. After every agent message, start a 30s timer; if the
  // user hasn't interacted by then, ask the backend for a gentle follow-up.
  const nudgeTimerRef = useRef(null);
  const nudgeCountRef = useRef(0);
  const sessionActiveRef = useRef(false);

  const { transcript, resetTranscript, listening } = useSpeechRecognition();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  // Cleanup on unmount so a stray timer can't fire after the component is gone
  useEffect(() => () => {
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
  }, []);

  const cancelNudgeTimer = () => {
    if (nudgeTimerRef.current) {
      clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
    }
  };

  const scheduleNudgeTimer = (ctx) => {
    cancelNudgeTimer();
    if (nudgeCountRef.current >= MAX_NUDGES) return;
    nudgeTimerRef.current = setTimeout(async () => {
      nudgeTimerRef.current = null;
      if (!sessionActiveRef.current) return;
      try {
        const data = await requestNudge({
          sessionId: ctx.sessionId,
          translateFrom: ctx.translateFrom,
          translateTo: ctx.translateTo,
        });
        if (!sessionActiveRef.current) return;
        if (data?.agent?.original) {
          nudgeCountRef.current += 1;
          setChatHistory(prev => [...prev, {
            role: "agent",
            original: data.agent.original,
            translated: ctx.mode === "learn" ? data.agent.translated : null,
          }]);
          speakText(data.agent.original, getLangCode(ctx.translateTo));
          // Re-arm in case the user is still silent
          scheduleNudgeTimer(ctx);
        }
      } catch (err) {
        console.error("Nudge failed:", err);
      }
    }, NUDGE_DELAY_MS);
  };

  if (!SpeechRecognition.browserSupportsSpeechRecognition()) {
    return <p style={{ padding: 20, color: "#9178cc" }}>Browser does not support speech recognition.</p>;
  }

  //Audio Code
  const getVoiceForLang = (langCode) => {
    const voices = speechSynthesis.getVoices();
    const base = langCode.split("-")[0];
    // Only return a voice that actually matches the target language. Falling
    // back to voices[0] (usually English) would try to read e.g. Chinese text
    // with an English voice, which produces no audible speech.
    return (
      voices.find(v => v.lang === langCode) ||
      voices.find(v => v.lang.toLowerCase().startsWith(base)) ||
      null
    );
  };

  const speakText = (text, lang = "en-US") => {
    const speak = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = getVoiceForLang(lang);
      if (voice) utterance.voice = voice;
      utterance.lang = lang;
      utterance.rate = 1;
      utterance.pitch = 1;
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    };

    // Voices can load asynchronously (especially on first use). If they aren't
    // ready yet, wait for the voiceschanged event so the right voice is picked.
    if (speechSynthesis.getVoices().length === 0) {
      speechSynthesis.addEventListener("voiceschanged", speak, { once: true });
    } else {
      speak();
    }
  };

  // Map both language codes (en, zh, …) and full names to BCP-47 voice locales.
  const getLangCode = (lang) => {
    const map = {
      en: "en-US", english: "en-US",
      es: "es-ES", spanish: "es-ES",
      fr: "fr-FR", french: "fr-FR",
      de: "de-DE", german: "de-DE",
      zh: "zh-CN", chinese: "zh-CN",
      auto: "en-US",
    };
    return map[lang?.toLowerCase()] || "en-US";
  };

  const startSession = async () => {
    if (!translateFrom || !translateTo || translateTo === "auto" || translateFrom === "auto") {
      alert("Please select both languages."); return;
    }
    const res = await fetch("http://localhost:3001/api/session/start", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: localStorage.getItem("userId"),
        mode,
        translateFrom,
        translateTo,
      }),
    });
    const data = await res.json();
    setSessionId(data._id); setSessionActive(true);
    sessionActiveRef.current = true;
    nudgeCountRef.current = 0;

    if (data.agent && data.agent.original) {
      const openingMsg = {
        role: "agent",
        original: data.agent.original,
        translated: mode === "learn" ? data.agent.translated : null,
      };
      setChatHistory([openingMsg]);
      speakText(data.agent.original, getLangCode(translateTo));
      scheduleNudgeTimer({
        sessionId: data._id,
        translateFrom,
        translateTo,
        mode,
      });
    } else {
      setChatHistory([]);
    }
  };

  const handleSendVoiceMessage = async () => {
    const userMessage = transcript.trim();
    if (!userMessage) return;
    resetTranscript(); setRecording(false);
    if (!sessionActive) { alert("Start session first"); return; }
    // User just spoke. Drop any pending nudge and reset the counter.
    cancelNudgeTimer();
    nudgeCountRef.current = 0;
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
      // Re-arm idle nudge after the agent's reply lands
      scheduleNudgeTimer({ sessionId, translateFrom, translateTo, mode });
    } catch (err) { console.error(err); }
  };

  const endSession = async () => {
    SpeechRecognition.stopListening(); setRecording(false);
    cancelNudgeTimer();
    nudgeCountRef.current = 0;
    sessionActiveRef.current = false;
    let endedSession = null;
    try {
      const res = await fetch("http://localhost:3001/api/session/end", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      // The backend returns the finished session (title, summary, vocab,
      // sentences). We hand it up so Learn mode can jump straight into the
      // automated study → activities → review flow for this session.
      endedSession = await res.json();
    } catch (err) {
      console.error("End session failed:", err);
    } finally {
      // Always reset the UI, even if the summary request errored, so we never
      // leave stale messages on screen with an inactive session.
      setSessionActive(false); setSessionId(null);
      setChatHistory([]);
      refreshSessions();
      if (endedSession && endedSession._id) {
        onSessionEnded?.(endedSession);
      }
    }
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

      // User is starting to speak. Cancel any pending idle nudge and reset
      // the counter so they get a fresh 30s window after their reply.
      cancelNudgeTimer();
      nudgeCountRef.current = 0;

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