
import { useState } from "react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import ChatMessage from "./ChatMessage";
import LanguageSelector from "./LanguageSelector";
import { sendUserMessage } from "../api/gemini";
import avatar from "../assets/user-avatar.png";

const ChatWindow = () => {
  const [chatHistory, setChatHistory] = useState([]);
  const [translateFrom, setTranslateFrom] = useState("auto");
  const [translateTo, setTranslateTo] = useState("en");

  const { transcript, resetTranscript, listening } = useSpeechRecognition();

  if (!SpeechRecognition.browserSupportsSpeechRecognition()) {
    return <p>Browser does not support speech recognition.</p>;
  }

  const handleSendVoiceMessage = async () => {
    const userMessage = transcript;
    resetTranscript();
    if (!userMessage) return;

    const { translatedUserMessage, agentReplyOriginal, agentReplyTranslated } =
      await sendUserMessage(userMessage, translateFrom, translateTo);

    setChatHistory(prev => [
      ...prev,
      { role: "user", original: userMessage, translated: translatedUserMessage },
      { role: "agent", original: agentReplyOriginal, translated: agentReplyTranslated },
    ]);
  };

  const toggleListening = () => {
    if (listening) {
      SpeechRecognition.stopListening();
      handleSendVoiceMessage();
    } else {
      SpeechRecognition.startListening({ continuous: true, language: translateFrom });
    }
  };

  return (
    <div style={{ display: "flex", height: "100%", width: "100%" }}>
      {/* Left Panel */}
      <div style={{
        width: "20%",
        backgroundColor: "#f5f5f5",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "20px"
      }}>
        <img src={avatar} alt="User Avatar" style={{
          width: "70px",
          borderRadius: "50%",
          alignSelf: "center"
        }}/>
        <button
          onClick={toggleListening}
          style={{
            marginBottom: "20px",
            padding: "15px",
            borderRadius: "50%",
            backgroundColor: listening ? "#ff4d4d" : "#4caf50",
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
        >
          {listening ? "Stop" : "Speak"}
        </button>
      </div>

      {/* Right Panel */}
      <div style={{ width: "80%", display: "flex", flexDirection: "column", padding: "20px" }}>
        <div style={{ marginBottom: "20px" }}>
          <LanguageSelector
            translateFrom={translateFrom}
            translateTo={translateTo}
            setTranslateFrom={setTranslateFrom}
            setTranslateTo={setTranslateTo}
          />
        </div>

        <div style={{
          flex: 1,
          overflowY: "auto",
          border: "1px solid #ccc",
          borderRadius: "10px",
          padding: "10px"
        }}>
          {chatHistory.map((msg, idx) => (
            <ChatMessage
              key={idx}
              role={msg.role}
              original={msg.original}
              translated={msg.translated}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;