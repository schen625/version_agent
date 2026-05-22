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