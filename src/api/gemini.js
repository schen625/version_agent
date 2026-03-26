export const sendUserMessage = async (message, translateFrom, translateTo) => {
  const res = await fetch("http://localhost:3001/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      translateFrom,
      translateTo
    }),
  });

  return res.json();
};