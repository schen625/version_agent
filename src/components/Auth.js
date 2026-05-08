import { useState } from "react";
import axios from "axios";

const Auth = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const endpoint = isLogin ? "/api/login" : "/api/signup";
      const res = await axios.post(`http://localhost:3001${endpoint}`, { username, password });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("userId", res.data.userId);
      localStorage.setItem("username", res.data.username);
      onLogin();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(145deg, #fdf6f0 0%, #f3eeff 50%, #e8f8f5 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Nunito', 'Segoe UI', sans-serif",
      position: "relative", overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        .auth-input {
          width: 100%; padding: 13px 18px; box-sizing: border-box;
          background: #fffdf9; border: 2px solid #e8e0f5;
          border-radius: 14px; font-size: 0.95rem; font-family: 'Nunito', sans-serif;
          color: #6e5a9e; outline: none; transition: border 0.2s, box-shadow 0.2s;
        }
        .auth-input::placeholder { color: #ccc0e8; }
        .auth-input:focus { border-color: #c4a8f0; box-shadow: 0 0 0 4px rgba(196,168,240,0.2); }
        .auth-btn {
          width: 100%; padding: 14px; border: none; border-radius: 16px;
          background: linear-gradient(135deg, #c9b3f5, #a8d8ea);
          color: white; font-size: 1rem; font-weight: 800;
          font-family: 'Nunito', sans-serif; cursor: pointer;
          box-shadow: 0 6px 20px rgba(196,168,240,0.4);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .auth-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(196,168,240,0.55); }
        .auth-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .toggle-link { color: #b09de0; font-weight: 800; cursor: pointer; text-decoration: underline dotted; }
        .toggle-link:hover { color: #9178cc; }
      `}</style>

      {/* Pastel blobs */}
      {[
        { top: -80, left: -80, size: 280, color: "rgba(201,179,245,0.3)" },
        { bottom: -60, right: -60, size: 240, color: "rgba(168,216,234,0.35)" },
        { top: "38%", right: -50, size: 160, color: "rgba(255,183,197,0.3)" },
        { top: "15%", left: "8%", size: 90, color: "rgba(255,224,178,0.5)" },
        { bottom: "25%", left: -30, size: 130, color: "rgba(178,235,210,0.3)" },
      ].map((b, i) => (
        <div key={i} style={{
          position: "fixed", width: b.size, height: b.size, borderRadius: "50%",
          background: b.color, top: b.top, left: b.left, bottom: b.bottom, right: b.right,
          pointerEvents: "none", filter: "blur(3px)", zIndex: 0,
        }} />
      ))}

      <div style={{
        width: "100%", maxWidth: 420, position: "relative", zIndex: 1,
        background: "rgba(255,255,255,0.82)", backdropFilter: "blur(20px)",
        borderRadius: 32, padding: "48px 42px",
        boxShadow: "0 16px 48px rgba(180,160,220,0.18), 0 2px 12px rgba(180,160,220,0.1)",
        border: "2px solid rgba(255,255,255,0.95)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 12, lineHeight: 1 }}></div>
          <h1 style={{
            margin: 0, fontSize: "1.75rem", fontWeight: 900,
            color: "#7a5faa", letterSpacing: "-0.5px",
          }}>
            {isLogin ? "Welcome back!" : "Join the fun!"}
          </h1>
          <p style={{ margin: "8px 0 0", color: "#b8a8d8", fontSize: "0.9rem", fontWeight: 600 }}>
            {isLogin ? "So happy to see you again!" : "Let's start your language adventure"}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input className="auth-input" placeholder="✏️  Username" value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
          <input className="auth-input" placeholder="🔒  Password" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
          <button className="auth-btn" onClick={submit} disabled={loading} style={{ marginTop: 4 }}>
            {loading ? "Just a sec… 🌀" : isLogin ? "Sign In 🚀" : "Create Account 🌟"}
          </button>
        </div>

        <p style={{ textAlign: "center", marginTop: 24, marginBottom: 0, color: "#bbaedd", fontSize: "0.88rem", fontWeight: 600 }}>
          {isLogin
            ? <> No account yet? <span className="toggle-link" onClick={() => setIsLogin(false)}>Sign up!</span></>
            : <> Already a member? <span className="toggle-link" onClick={() => setIsLogin(true)}>Sign in</span></>}
        </p>
      </div>
    </div>
  );
};

export default Auth;