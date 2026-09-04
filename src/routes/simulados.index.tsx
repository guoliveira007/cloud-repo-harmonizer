import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, percent } from "@/lib/exam-utils";

export const Route = createFileRoute("/simulados/")({
  head: () => ({
    meta: [
      { title: "Simulados — Fichário" },
      {
        name: "description",
        content: "Corrija seus simulados com a IA e acompanhe a nota de cada prova.",
      },
      { property: "og:title", content: "Simulados — Fichário" },
      { property: "og:description", content: "Histórico de simulados corrigidos com nota e data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <SimuladosPage />
    </AppShell>
  ),
});

function SimuladosPage() {
  const [term, setTerm] = useState("");

  const exams = useQuery({
    queryKey: ["exams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("id, title, exam_date, board, total_questions, correct_count")
        .order("exam_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const list = (exams.data ?? []).filter((e) =>
    `${e.title} ${e.board ?? ""}`.toLowerCase().includes(term.trim().toLowerCase()),
  );

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sun-deep">Corretor</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Simulados</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Envie prova, gabarito e suas respostas — a IA corrige e explica cada erro.
          </p>
        </div>
        <Link
          to="/simulados/novo"
          className="inline-flex items-center gap-2 rounded-md bg-sun px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" /> Novo simulado
        </Link>
      </header>

      <input
        className="mt-6 w-full max-w-sm rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-sun"
        placeholder="Buscar por nome ou banca…"
        value={term}
        maxLength={80}
        onChange={(e) => setTerm(e.target.value)}
      />

      {exams.isLoading ? (
        <p className="mt-8 font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">Carregando…</p>
      ) : list.length === 0 ? (
        <p className="mt-8 text-sm text-ink-soft">
          Nenhum simulado ainda. Comece corrigindo o primeiro.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((e) => (
            <Link
              key={e.id}
              to="/simulados/$id"
              params={{ id: e.id }}
              className="rounded-xl border border-line bg-card p-5 transition-colors hover:border-sun"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                {formatDate(e.exam_date)}
                {e.board ? ` · ${e.board}` : ""}
              </p>
              <h2 className="mt-1 font-display text-lg font-semibold">{e.title}</h2>
              <div className="mt-4 flex items-end justify-between">
                <span className="font-display text-3xl font-bold text-sun-deep">
                  {percent(e.correct_count, e.total_questions)}%
                </span>
                <span className="text-xs text-ink-soft">
                  {e.correct_count}/{e.total_questions} acertos
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
