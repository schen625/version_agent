const ChatMessage = ({ role, original, translated }) => {
  const isUser = role === "user";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: "10px",
      }}
    >
      <div
        style={{
          maxWidth: "70%",
          backgroundColor: isUser ? "#4caf50" : "#e0e0e0",
          color: isUser ? "white" : "black",
          borderRadius: "15px",
          padding: "10px",
          wordBreak: "break-word",
        }}
      >
        <p style={{ margin: 0, fontWeight: "bold" }}>
          {isUser ? "You" : "Agent"}
        </p>

        <p style={{ margin: "5px 0" }}>
          {original}
        </p>

        {translated && (
          <p style={{ margin: 0, opacity: 0.8 }}>
            Translated: {translated}
          </p>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;