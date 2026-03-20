// File: client/src/components/LoginScreen.tsx
import { useState } from "react";

type Props = {
  onSubmit: (username: string, password: string) => Promise<void>;
  error: string;
  loading: boolean;
};

export default function LoginScreen({ onSubmit, error, loading }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="badge">Blue Matrix AI</div>
        <h1>Call Center Login</h1>
        <p>Each call center signs in with its own account and pays with its own OpenAI key.</p>

        <form
          onSubmit={async (event) => {
            event.preventDefault();
            await onSubmit(username, password);
          }}
          className="stack"
        >
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="buwelo" />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          {error ? <div className="error-box">{error}</div> : null}

          <button className="primary-btn" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="demo-box">
          Demo users: telus / buwelo / concentrix / teleperformance / wns
        </div>
      </div>
    </div>
  );
}
