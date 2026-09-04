import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { StudyPlanContent } from "@/components/StudyPlan";
import { supabase } from "@/integrations/supabase/client";
import { generateStudyPlan } from "@/lib/exams.functions";
import { backfillExamSubjects } from "@/lib/exam-link";
import { fetchSubjects } from "@/lib/study";

export const Route = createFileRoute("/revisoes")({
  head: () => ({
    meta: [
      { title: "Revisões e plano de estudo — Fichário" },
      {
        name: "description",
        content: "Padrões dos seus erros nos simulados e um plano de revisão gerado pela IA.",
      },
      { property: "og:title", content: "Revisões e plano de estudo" },
      {
        property: "og:description",
        content: "Tipos de erro mais frequentes e prioridades da semana.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <Revisoes />
    </AppShell>
  ),
});

function Revisoes() {
  const queryClient = useQueryClient();
  const makePlan = useServerFn(generateStudyPlan);

  const { data: subjects = [] } = useQuery({ queryKey: ["subjects"], queryFn: fetchSubjects });

  // Liga as questões antigas de simulado às matérias/frentes do fichário.
  useQuery({
    queryKey: ["exam-backfill", subjects.length],
    queryFn: () => backfillExamSubjects(subjects),
    enabled: subjects.length > 0,
    staleTime: 5 * 60 * 1000,
  });


  const reviews = useQuery({
    queryKey: ["revisoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("error_reviews")
        .select("id, error_type, concept, why_wrong, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const plan = useQuery({
    queryKey: ["study-plan"],
    queryFn: async () => {
      const { data } = await supabase
        .from("study_plans")
        .select("id, content, created_at")
        .is("exam_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: () => makePlan({ data: {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["study-plan"] });
      toast.success("Plano de revisão atualizado.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao gerar o plano."),
  });

  const rows = reviews.data ?? [];
  const byType = new Map<string, number>();
  const byConcept = new Map<string, number>();
  for (const r of rows) {
    const type = r.error_type ?? "Outro";
    const concept = r.concept ?? "Sem conceito";
    byType.set(type, (byType.get(type) ?? 0) + 1);
    byConcept.set(concept, (byConcept.get(concept) ?? 0) + 1);
  }
  const types = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const concepts = [...byConcept.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const max = types[0]?.[1] ?? 1;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sun-deep">Corretor</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Revisões</h1>
          <p className="mt-2 text-sm text-ink-soft">
            O padrão dos seus erros e o que estudar em seguida.
          </p>
        </div>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-sun px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {plan.data ? "Atualizar plano" : "Gerar plano"}
        </button>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-card p-6">
          <h2 className="font-display text-lg font-semibold">Tipos de erro</h2>
          {types.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">
              Analise os erros dos seus simulados para ver os padrões aqui.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {types.map(([type, count]) => (
                <li key={type}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{type}</span>
                    <span className="font-mono text-xs text-ink-soft">{count}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-line">
                    <div
                      className="h-1.5 rounded-full bg-sun"
                      style={{ width: `${Math.round((count / max) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-line bg-card p-6">
          <h2 className="font-display text-lg font-semibold">Conceitos a revisar</h2>
          {concepts.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">Nenhum conceito registrado ainda.</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {concepts.map(([concept, count]) => (
                <span
                  key={concept}
                  className="rounded-full border border-line px-3 py-1 text-xs text-ink-soft"
                >
                  {concept}
                  <span className="ml-1.5 font-mono text-[10px] text-sun-deep">{count}×</span>
                </span>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-line bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Plano de estudo</h2>
        <div className="mt-4">
          {plan.data ? (
            <StudyPlanContent content={plan.data.content} />
          ) : (
            <p className="text-sm text-ink-soft">
              Gere um plano com base nos seus últimos simulados.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
