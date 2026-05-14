import axios from "axios";

export const signup = (data) =>
  axios.post("http://localhost:3001/api/signup", data);

export const login = (data) =>
  axios.post("http://localhost:3001/api/login", data);