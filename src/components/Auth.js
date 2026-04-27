import { useState } from "react";
import axios from "axios";

const Auth = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submit = async () => {
    try {
      const endpoint = isLogin ? "/api/login" : "/api/signup";
      const res = await axios.post(
        `http://localhost:3001${endpoint}`,
        { username, password }
      );

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("userId", res.data.userId);
      localStorage.setItem("username", res.data.username);

      onLogin();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h2>{isLogin ? "Sign In" : "Create Account"}</h2>

      <input
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />

      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button onClick={submit}>
        {isLogin ? "Sign In" : "Create Account"}
      </button>

      <p
        style={{ cursor: "pointer", color: "blue" }}
        onClick={() => setIsLogin(!isLogin)}
      >
        {isLogin ? "Create account" : "Already have an account? Sign in"}
      </p>
    </div>
  );
};

export default Auth;