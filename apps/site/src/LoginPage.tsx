import { useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "@knowledge/components";
import { useAuth } from "./auth";

/** Full-screen sign-in gate shown until a session exists. */
export function LoginPage() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn(username, password);
    if (!res.ok) setError(res.error ?? "Sign-in failed.");
    setBusy(false);
  };

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <div className="login__brand">
          <span className="login__logo">
            <Icon icon="lucide:brain-circuit" size={22} />
          </span>
          <div>
            <h1>Knowledge Platform</h1>
            <p>Sign in to continue</p>
          </div>
        </div>

        <label className="login__field">
          <span>User</span>
          <input
            type="text"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="felipe.barquero"
          />
        </label>

        <label className="login__field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        {error && (
          <div className="login__error">
            <Icon icon="lucide:circle-alert" size={14} /> {error}
          </div>
        )}

        <button type="submit" className="login__submit" disabled={busy || !username || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="login__hint">Local account · your session stays in this browser</p>
      </form>
    </div>
  );
}
