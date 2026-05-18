export const sendMessage = async ({
  sessionId,
  message,
  translateFrom,
  translateTo,
  mode,
}) => {
  const res = await fetch("http://localhost:3001/api/session/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      message,
      translateFrom,
      translateTo,
      mode,
    }),
  });

  return res.json();
};

export const fetchTopicSuggestions = async () => {
  const res = await fetch("http://localhost:3001/api/topics/suggest");
  if (!res.ok) throw new Error("Failed to load topics");
  return res.json();
};