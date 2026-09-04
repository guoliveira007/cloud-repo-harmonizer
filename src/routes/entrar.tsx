import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";


export const Route = createFileRoute("/entrar")({
  head: () => ({
    meta: [
      { title: "Entrar no Fichário — painel de estudos" },
      {
        name: "description",
        content: "Acesse sua conta do Fichário para estudar matérias, PDFs, flashcards e quizzes.",
      },
      { property: "og:title", content: "Entrar no Fichário" },
      { property: "og:description", content: "Acesse seu painel de estudos do Fichário." },
    ],
  }),
  component: EntrarPage,
});

function EntrarPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Conta criada! Já pode começar a estudar.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível continuar.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Não foi possível entrar com o Google.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  }


  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-sun font-display text-sm font-bold text-primary-foreground">
            F
          </span>
          <span className="font-display text-lg font-bold tracking-tight">Fichário</span>
        </div>

        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-balance">
          {mode === "login" ? "Hora de virar a página." : "Comece seu fichário."}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Matérias, PDFs, flashcards e quizzes em um só painel.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3 rounded-xl border border-line bg-card p-5">
          {mode === "signup" && (
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                Nome
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-sun"
                placeholder="Seu nome"
              />
            </div>
          )}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              E-mail
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-sun"
              placeholder="voce@email.com"
            />
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              Senha
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-sun"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-sun px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-sun-deep disabled:opacity-50"
          >
            {mode === "login" ? "Entrar" : "Criar conta"}
          </button>

          <button
            type="button"
            onClick={google}
            className="w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-sun"
          >
            Continuar com Google
          </button>

          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="w-full pt-1 text-center font-mono text-[11px] text-ink-soft underline-offset-4 hover:underline"
          >
            {mode === "login" ? "Ainda não tenho conta" : "Já tenho conta"}
          </button>
        </form>
      </div>
    </main>
  );
}
