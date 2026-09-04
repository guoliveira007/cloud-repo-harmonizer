import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Layers, Loader2, ListChecks, Upload } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { subjectIdForLesson } from "@/data/subject-map";
import { generateLessonSummary } from "@/lib/lesson-summary.functions";
import { generateFromLessonSummary } from "@/lib/lesson-cards.functions";
import { fetchSubjects } from "@/lib/study";
import { downloadSummaryPdf } from "@/lib/summary-pdf";

type Props = {
  lesson: { id: string; title: string; subject?: string; frente?: string } | null;
  onOpenChange: (open: boolean) => void;
};


async function fetchSummary(lessonId: string) {
  const { data, error } = await supabase
    .from("lesson_summaries")
    .select("summary,transcript,updated_at")
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function LessonSummaryDialog({ lesson, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const generate = useServerFn(generateLessonSummary);
  const [transcript, setTranscript] = useState("");
  const [editing, setEditing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["lesson-summary", lesson?.id],
    queryFn: () => fetchSummary(lesson!.id),
    enabled: !!lesson,
  });

  const { data: dbSubjects = [] } = useQuery({ queryKey: ["subjects"], queryFn: fetchSubjects });
  const targetSubjectId = lesson?.subject
    ? subjectIdForLesson(dbSubjects, lesson.subject, lesson.frente)
    : null;

  const genItems = useServerFn(generateFromLessonSummary);
  const [pending, setPending] = useState<"flashcards" | "quiz" | null>(null);

  async function generateItems(kind: "flashcards" | "quiz") {
    if (!lesson || !targetSubjectId) {
      toast.error("Não encontrei a frente desta aula nas suas matérias.");
      return;
    }
    setPending(kind);
    try {
      const res = await genItems({
        data: { lessonId: lesson.id, subjectId: targetSubjectId, kind, count: 25 },
      });
      toast.success(
        kind === "flashcards"
          ? `${res.created} flashcards criados na frente da aula.`
          : `${res.created} questões criadas na frente da aula.`,
      );
      queryClient.invalidateQueries({ queryKey: [kind === "flashcards" ? "flashcards" : "questions"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar agora.");
    } finally {
      setPending(null);
    }
  }

  useEffect(() => {
    setTranscript("");
    setEditing(false);
  }, [lesson?.id]);


  const mutation = useMutation({
    mutationFn: async () => {
      if (!lesson) return;
      return generate({
        data: {
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          subject: lesson.subject,
          ...(targetSubjectId ? { subjectId: targetSubjectId } : {}),
          transcript: transcript.trim(),
        },
      });
    },
    onSuccess: () => {
      toast.success("Resumo gerado!");
      setEditing(false);
      setTranscript("");
      queryClient.invalidateQueries({ queryKey: ["lesson-summary", lesson?.id] });
      queryClient.invalidateQueries({ queryKey: ["lesson-summaries"] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o resumo.");
    },
  });

  async function onFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 5 MB).");
      return;
    }
    setTranscript(await file.text());
  }

  const showForm = editing || (!isLoading && !data?.summary);

  return (
    <Dialog open={!!lesson} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 text-left text-base">
            Resumo · {lesson?.title ?? ""}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-ink-soft">
            <Loader2 className="size-4 animate-spin" /> carregando…
          </p>
        )}

        {showForm && (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">
              Cole a transcrição completa da aula (ou envie um arquivo .txt) e a IA monta um resumo
              detalhado fiel ao que foi dito.
            </p>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Cole aqui a transcrição da aula…"
              className="h-56 w-full resize-y rounded-md border border-line bg-background p-3 text-sm outline-none focus:border-sun"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-line px-3 py-1.5 font-mono text-[11px] text-ink-soft transition-colors hover:text-sun-deep">
                <Upload className="size-3.5" /> enviar .txt
                <input
                  type="file"
                  accept=".txt,.md,.srt,.vtt,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <span className="font-mono text-[10px] text-ink-soft">
                {transcript.length.toLocaleString("pt-BR")} caracteres
              </span>
              <button
                disabled={mutation.isPending || transcript.trim().length < 200}
                onClick={() => mutation.mutate()}
                className="ml-auto flex items-center gap-1.5 rounded-md bg-sun px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {mutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileText className="size-4" />
                )}
                {data?.summary ? "Regerar resumo" : "Gerar resumo"}
              </button>
            </div>
          </div>
        )}

        {!showForm && data?.summary && (
          <div className="space-y-4">
            <div className="space-y-3 text-sm leading-relaxed text-ink">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h2: (p) => (
                    <h2 className="mt-5 font-display text-lg font-bold tracking-tight" {...p} />
                  ),
                  h3: (p) => <h3 className="mt-4 font-display text-base font-semibold" {...p} />,
                  p: (p) => <p className="text-sm text-ink-soft" {...p} />,
                  ul: (p) => <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft" {...p} />,
                  ol: (p) => (
                    <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft" {...p} />
                  ),
                  strong: (p) => <strong className="font-semibold text-ink" {...p} />,
                  code: (p) => (
                    <code className="rounded bg-background px-1 py-0.5 font-mono text-[12px]" {...p} />
                  ),
                }}
              >
                {data.summary}
              </ReactMarkdown>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  if (!lesson) return;
                  downloadSummaryPdf({
                    title: lesson.title,
                    subject: lesson.subject ?? null,
                    markdown: data.summary,
                    updatedAt: data.updated_at,
                  });
                }}
                className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 font-mono text-[11px] text-ink-soft transition-colors hover:text-sun-deep"
              >
                <Download className="size-3.5" /> baixar PDF
              </button>
              <button
                disabled={pending !== null}
                onClick={() => void generateItems("flashcards")}
                className="flex items-center gap-1.5 rounded-md bg-sun px-3 py-1.5 font-mono text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                {pending === "flashcards" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Layers className="size-3.5" />
                )}
                gerar 25 flashcards
              </button>
              <button
                disabled={pending !== null}
                onClick={() => void generateItems("quiz")}
                className="flex items-center gap-1.5 rounded-md bg-sun px-3 py-1.5 font-mono text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                {pending === "quiz" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ListChecks className="size-3.5" />
                )}
                gerar 25 questões
              </button>
              <button
                onClick={() => {
                  setTranscript(data.transcript ?? "");
                  setEditing(true);
                }}
                className="rounded-md border border-line px-3 py-1.5 font-mono text-[11px] text-ink-soft transition-colors hover:text-sun-deep"
              >
                enviar nova transcrição
              </button>

            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
