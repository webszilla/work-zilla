import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";

import { apiGet, apiPost } from "@/core/api/http";
import { AuthSession, SignupResponse } from "@/core/theme/types";

type AuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  error: string;
  refreshSession: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  signup: (payload: Record<string, string>) => Promise<SignupResponse>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  error: "",
  refreshSession: async () => undefined,
  login: async () => undefined,
  signup: async () => ({ ok: false, authenticated: false, verification_sent: false, pricing_url: "", message: "" }),
  logout: async () => undefined
});

async function fetchSession(): Promise<AuthSession | null> {
  try {
    return await apiGet<AuthSession>("/api/auth/me");
  } catch (error) {
    return null;
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshSession = async () => {
    const nextSession = await fetchSession();
    setSession(nextSession?.authenticated ? nextSession : null);
    setError("");
  };

  useEffect(() => {
    let active = true;

    fetchSession()
      .then((nextSession) => {
        if (!active) {
          return;
        }
        setSession(nextSession?.authenticated ? nextSession : null);
      })
      .catch((reason: Error) => {
        if (!active) {
          return;
        }
        setError(reason.message || "Unable to load session");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const login = async (username: string, password: string) => {
    setError("");
    await apiGet("/api/auth/csrf");
    await apiPost("/api/auth/login", { username, password });
    await refreshSession();
  };

  const signup = async (payload: Record<string, string>) => {
    setError("");
    await apiGet("/api/auth/csrf");
    const response = await apiPost<SignupResponse>("/api/auth/signup", payload);
    await refreshSession();
    return response;
  };

  const logout = async () => {
    await apiPost("/api/auth/logout", {});
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, error, refreshSession, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
