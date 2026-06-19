import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Local, single-user auth — NO backend, NO AWS. This gates the reader UI; it is
 * NOT a security boundary (a static SPA ships its data + JS to the browser, so
 * client-side auth only hides the interface). The seed password is never stored
 * in plaintext: we keep a salted SHA-256 hash and compare hashes at sign-in.
 *
 * The `useAuth()` surface (user / signIn / signOut) is the seam — swap this
 * provider for a real IdP (Cognito, etc.) later without touching the UI.
 */

export interface User {
  username: string;
  name: string;
  email: string;
}

const SALT = "kp.knowledge.platform.v1";
const SESSION_KEY = "kp.auth.session";
const PHOTO_KEY = "kp.profile.photo";

interface Account extends User {
  /** SHA-256(SALT + password) — the plaintext password is never in the bundle. */
  passHash: string;
}

// Seeded account. passHash = SHA-256("kp.knowledge.platform.v1" + the password).
const ACCOUNTS: Account[] = [
  {
    username: "felipe.barquero",
    name: "Felipe Barquero",
    email: "felipe.barquero@gmx.de",
    passHash: "2cb72497dc7d4a6013d1697fec9475627a775bdd0c99bef16a83796a3c999dd1",
  },
];

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toUser(a: Account): User {
  return { username: a.username, name: a.name, email: a.email };
}

export interface AuthState {
  user: User | null;
  /** False until the persisted session has been read (avoids a login flash). */
  ready: boolean;
  /** Profile photo URL (local preference) or null → initials fallback. */
  photo: string | null;
  signIn: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => void;
  setPhoto: (url: string | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [photo, setPhotoState] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const { username } = JSON.parse(raw) as { username: string };
        const acct = ACCOUNTS.find((a) => a.username === username);
        if (acct) setUser(toUser(acct));
      }
      setPhotoState(localStorage.getItem(PHOTO_KEY));
    } catch {
      /* corrupt session — ignore, stay signed out */
    }
    setReady(true);
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const acct = ACCOUNTS.find((a) => a.username === username.trim().toLowerCase());
    if (!acct) return { ok: false, error: "Unknown user." };
    const hash = await sha256Hex(SALT + password);
    if (hash !== acct.passHash) return { ok: false, error: "Incorrect password." };
    localStorage.setItem(SESSION_KEY, JSON.stringify({ username: acct.username, ts: Date.now() }));
    setUser(toUser(acct));
    return { ok: true };
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  const setPhoto = useCallback((url: string | null) => {
    if (url) localStorage.setItem(PHOTO_KEY, url);
    else localStorage.removeItem(PHOTO_KEY);
    setPhotoState(url);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, ready, photo, signIn, signOut, setPhoto }),
    [user, ready, photo, signIn, signOut, setPhoto],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

/** Avatar fallback initials, e.g. "Felipe Barquero" → "FB". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}
