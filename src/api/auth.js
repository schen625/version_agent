import axios from "axios";

export const signup = (data) =>
  axios.post("http://localhost:3001/api/signup", data);

export const login = (data) =>
  axios.post("http://localhost:3001/api/login", data); import axios from "axios";

export const sendMessage = async (
  message,
  translateFrom,
  translateTo,
  mode
) => {
  const token = localStorage.getItem("token");

  const res = await axios.post(
    "http://localhost:3001/api/chat",
    {
      message,
      translateFrom,
      translateTo,
      mode,
    },
    {
      headers: {
        Authorization: token,
      },
    }
  );

  return res.data;
};