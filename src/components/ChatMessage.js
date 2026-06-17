const ChatMessage = ({
  role,
  original,
  translated,
  originalLang = "en-US",
  translatedLang = "en-US"
}) => {
  const getVoiceForLang = (langCode) => {
    const voices = speechSynthesis.getVoices();

    return (
      voices.find((v) => v.lang === langCode) ||
      voices.find((v) => v.lang.startsWith(langCode.split("-")[0])) ||
      voices[0]
    );
  };

  const speak = (text, language) => {
    const utterance = new SpeechSynthesisUtterance(text);

    const voice = getVoiceForLang(language);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.lang = language;
    utterance.rate = 1;
    utterance.pitch = 1;

    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  };

  const isUser = role === "user";

  return (
    <div style={{
      display: "flex",
      justifyContent: isUser ? "flex-end" : "flex-start",
      alignItems: "flex-end",
      gap: 8,
      marginBottom: 14,
      animation: "popIn 0.2s cubic-bezier(0.34,1.56,0.64,1)",
    }}>
      <style>{`
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.88) translateY(6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .speak-btn {
          background: rgba(255,255,255,0.6); border: 1.5px solid rgba(255,255,255,0.9);
          border-radius: 50%; width: 26px; height: 26px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; font-size: 11px; transition: transform 0.15s, background 0.15s;
          box-shadow: 0 2px 6px rgba(180,160,220,0.2);
        }
        .speak-btn:hover { transform: scale(1.15); background: white; }
      `}</style>

      {/* Agent */}
      {!isUser && (
        <div style={{
          width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, #f9c6d0, #c9b3f5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, boxShadow: "0 3px 10px rgba(201,179,245,0.4)",
          border: "2px solid white",
        }}>🤖</div>
      )}

      <div style={{
        maxWidth: "62%",
        background: isUser
          ? "linear-gradient(135deg, #c9b3f5, #a8d8ea)"
          : "rgba(255,255,255,0.85)",
        color: isUser ? "white" : "#6e5a9e",
        padding: "12px 16px",
        borderRadius: isUser ? "20px 20px 6px 20px" : "20px 20px 20px 6px",
        border: isUser ? "none" : "1.5px solid rgba(201,179,245,0.35)",
        boxShadow: isUser
          ? "0 6px 20px rgba(201,179,245,0.4)"
          : "0 4px 16px rgba(180,160,220,0.15)",
        backdropFilter: "blur(8px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "0.93rem", lineHeight: 1.5, fontWeight: 600 }}>{original}</span>
          <button className="speak-btn" onClick={() => speak(original, originalLang)}>🔊</button>
        </div>

        {translated && (
          <div style={{
            marginTop: 8, paddingTop: 8,
            borderTop: isUser ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(201,179,245,0.25)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              fontSize: "0.82rem", lineHeight: 1.4,
              opacity: 0.75, fontWeight: 500,
              color: isUser ? "white" : "#9e8cc0",
            }}>
              {translated}
            </span>
            <button className="speak-btn" onClick={() => speak(translated, translatedLang)}>🔊</button>
          </div>
        )}
      </div>

      {/* User */}
      {isUser && (
        <div style={{
          width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, #a8d8ea, #b5ead7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, boxShadow: "0 3px 10px rgba(168,216,234,0.4)",
          border: "2px solid white",
        }}>👤</div>
      )}
    </div>
  );
};

export default ChatMessage;