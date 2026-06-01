"use client";

import { FormEvent, useEffect, useState } from "react";

export function useAdminSession() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isAuthBusy, setIsAuthBusy] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session");
        const result = (await response.json()) as { isAdmin?: boolean };

        if (!ignore) {
          setIsAdmin(Boolean(response.ok && result.isAdmin));
        }
      } catch {
        if (!ignore) {
          setIsAdmin(false);
        }
      }
    }

    void loadSession();

    return () => {
      ignore = true;
    };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAuthBusy(true);
    setAuthMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: adminPassword }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        isAdmin?: boolean;
        error?: string;
      };

      if (!response.ok || !result.isAdmin) {
        setAuthMessage(result.error ?? "Login failed.");
        return;
      }

      setIsAdmin(true);
      setAdminPassword("");
      setAuthMessage(null);
    } catch {
      setAuthMessage("Could not reach the login endpoint.");
    } finally {
      setIsAuthBusy(false);
    }
  }

  async function handleLogout() {
    setIsAuthBusy(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setIsAdmin(false);
      setAuthMessage(null);
      setIsAuthBusy(false);
    }
  }

  return {
    adminPassword,
    authMessage,
    handleLogin,
    handleLogout,
    isAdmin,
    isAuthBusy,
    setAdminPassword,
  };
}
