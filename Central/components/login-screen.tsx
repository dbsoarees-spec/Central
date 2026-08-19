"use client";

import { useState } from "react";
import { apiMutation } from "@/components/use-api";
import { Field } from "@/components/ui";

export function LoginScreen() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiMutation("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
        }),
      });
      const returnTo = new URLSearchParams(window.location.search).get("return_to");
      window.location.assign(
        returnTo?.startsWith("/") && !returnTo.startsWith("//")
          ? returnTo
          : "/inicio",
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Erro ao entrar.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <span className="login-logo" role="img" aria-label="Central Express" />
        <span className="eyebrow">Sistema de fretes</span>
        <h1>Central Express</h1>
        <p>Entre com o usuário e a senha cadastrados pelo administrador.</p>
        <form className="form-stack" onSubmit={submit}>
          <Field label="Usuário">
            <input
              name="username"
              autoComplete="username"
              autoFocus
              required
            />
          </Field>
          <Field label="Senha">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary" disabled={saving}>
            {saving ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
