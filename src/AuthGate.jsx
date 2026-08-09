import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const C = {
  bg: "#0F1923",
  panel: "#16222E",
  border: "#28394A",
  text: "#E7EEF3",
  textDim: "#8FA3B3",
  teal: "#00C9A7",
  red: "#E84545",
};

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setError(error.message);
  };

  if (session === undefined) {
    return <div style={{ background: C.bg, color: C.text, minHeight: "100vh" }} />;
  }

  if (!session) {
    return (
      <div
        style={{
          background: C.bg,
          color: C.text,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 28,
            width: 320,
          }}
        >
          <h2 style={{ marginTop: 0 }}>{mode === "login" ? "Log in" : "Sign up"}</h2>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
          {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%",
              background: C.teal,
              color: "#04241d",
              border: "none",
              borderRadius: 8,
              padding: "10px 0",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {busy ? "…" : mode === "login" ? "Log in" : "Sign up"}
          </button>
          <div
            style={{ marginTop: 12, fontSize: 12, color: C.textDim, cursor: "pointer" }}
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
          </div>
        </form>
      </div>
    );
  }

  return children({ session });
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0F1923",
  color: "#E7EEF3",
  border: "1px solid #28394A",
  borderRadius: 8,
  padding: "9px 10px",
  fontSize: 13,
  marginBottom: 10,
  fontFamily: "inherit",
};
