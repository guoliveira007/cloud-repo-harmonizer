import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";

import { supabase } from "@/integrations/supabase/client";
import { analyzeError } from "@/lib/exams.functions";
import { transcribeSolutionPhoto } from "@/lib/photo.functions";
import { createFlashcardFromError } from "@/lib/exam-link";
import { fetchSubjects } from "@/lib/study";
import { ERROR_KINDS, toErrorKind, type ErrorKind } from "@/lib/practice";

export type AnalyzableQuestion = {
  id: string;
  number?: number;
  subject_id?: string | null;
  subject: string | null;
  topic: string | null;
  statement: string | null;
  correct_answer: string | null;
  user_answer?: string | null;
};

type Props = {
  question: AnalyzableQuestion;
  /** Chamado depois que o aluno confirma o tipo de erro. */
  onDone?: (kind: ErrorKind) => void;
  onCancel?: () => void;
};

export function ErrorAnalysis({ question, onDone, onCancel }: Props) {
  const [text, setText] = useState("");
  const [reanalyzing, setReanalyzing] = useState(false);
  const queryClient = useQueryClient();
  const analyze = useServerFn(analyzeError);

  const review = useQuery({
    queryKey: ["error-review", question.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("error_reviews")
        .select("*")
        .eq("question_id", question.id)
        .maybeSingle();
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await analyze({ data: { questionId: question.id, explanation: text } });
      try {
        const subjects = await fetchSubjects();
        await createFlashcardFromError(subjects, question, result);
      } catch {
        /* flashcard é bônus, não bloqueia a análise */
      }
      return result;
    },
    onSuccess: () => {
      setText("");
      setReanalyzing(false);
      queryClient.invalidateQueries({ queryKey: ["error-review", question.id] });
      queryClient.invalidateQueries({ queryKey: ["revisoes"] });
      queryClient.invalidateQueries({ queryKey: ["subject-errors"] });
      queryClient.invalidateQueries({ queryKey: ["flashcards"] });
      toast.success("Análise pronta. Confirme o tipo de erro.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao analisar."),
  });

  const data = reanalyzing ? null : review.data;

  if (review.isLoading) {
    return <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">Carregando…</p>;
  }

  if (data) {
    return (
      <div className="space-y-4 text-sm">
        <div>
          <p className="font-display font-semibold">Onde o raciocínio falhou</p>
          <p className="mt-1 text-ink-soft">{data.why_wrong}</p>
        </div>
        <div>
          <p className="font-display font-semibold">Caminho correto</p>
          <p className="mt-1 whitespace-pre-line text-ink-soft">{data.correct_reasoning}</p>
        </div>
        {data.visual_svg && (
          <figure className="rounded-lg border border-line bg-paper p-4 text-ink">
            <div dangerouslySetInnerHTML={{ __html: data.visual_svg }} />
            {data.visual_caption && (
              <figcaption className="mt-2 text-center text-xs text-ink-soft">
                {data.visual_caption}
              </figcaption>
            )}
          </figure>
        )}
        <span className="inline-block rounded-full bg-sun/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-sun-deep">
          {data.concept}
        </span>

        <ErrorKindPicker
          questionId={question.id}
          current={data.error_type}
          {...(onDone ? { onDone } : {})}
        />


        <button
          onClick={() => {
            setText(data.user_explanation ?? "");
            setReanalyzing(true);
          }}
          className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-soft hover:text-sun-deep"
        >
          Reanalisar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">
        Explique o raciocínio que te levou à alternativa marcada
      </label>
      <textarea
        className="min-h-24 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-sun"
        value={text}
        maxLength={3000}
        placeholder="Achei que bastava multiplicar as duas taxas porque…"
        onChange={(e) => setText(e.target.value)}
      />
      <PhotoCapture questionId={question.id} onText={(t) => setText((prev) => (prev ? `${prev}\n${t}` : t))} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || text.trim().length < 5}
          className="inline-flex items-center gap-2 rounded-md bg-sun px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Analisar erro
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-ink-soft hover:text-ink"
          >
            <X className="size-4" /> Fechar
          </button>
        )}
      </div>
    </div>
  );
}

function ErrorKindPicker({
  questionId,
  current,
  onDone,
}: {
  questionId: string;
  current: string | null;
  onDone?: (kind: ErrorKind) => void;
}) {
  const suggested = toErrorKind(current);
  const [kind, setKind] = useState<ErrorKind>(suggested);
  const [confirmed, setConfirmed] = useState(
    ERROR_KINDS.some((k) => k.id === current),
  );
  const queryClient = useQueryClient();

  async function pick(next: ErrorKind) {
    setKind(next);
    const { error } = await supabase
      .from("error_reviews")
      .update({ error_type: next })
      .eq("question_id", questionId);
    if (error) {
      toast.error("Não foi possível salvar o tipo de erro.");
      return;
    }
    setConfirmed(true);
    queryClient.invalidateQueries({ queryKey: ["error-review", questionId] });
    queryClient.invalidateQueries({ queryKey: ["subject-pending"] });
    onDone?.(next);
  }

  return (
    <div className="rounded-lg border border-line bg-paper p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
        {confirmed ? "Tipo de erro confirmado" : "Confirme o tipo de erro"}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ERROR_KINDS.map((k) => {
          const active = kind === k.id;
          return (
            <button
              key={k.id}
              onClick={() => pick(k.id)}
              className={
                active
                  ? "rounded-full bg-sun px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  : "rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-sun"
              }
            >
              {k.label}
            </button>
          );
        })}
      </div>
      {!confirmed && (
        <p className="mt-2 text-xs text-ink-soft">
          Sugestão da IA pré-selecionada — toque para confirmar ou corrigir.
        </p>
      )}
    </div>
  );
}

/** Handshake desktop↔celular: QR → foto → transcrição na caixa de texto. */
function PhotoCapture({
  questionId,
  onText,
}: {
  questionId: string;
  onText: (text: string) => void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("pending");
  const [busy, setBusy] = useState(false);
  const doneRef = useRef(false);

  async function start() {
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Sessão expirada.");
      const { data, error } = await supabase
        .from("upload_sessions")
        .insert({ user_id: uid, exam_question_id: questionId, status: "pending" })
        .select("id")
        .single();
      if (error) throw error;
      doneRef.current = false;
      setStatus("pending");
      setSessionId(data.id);
      setQr(
        await QRCode.toDataURL(`${window.location.origin}/upload/${data.id}`, {
          margin: 1,
          width: 220,
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar o QR.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const apply = (row: { status: string; transcript: string | null }) => {
      if (cancelled || doneRef.current) return;
      setStatus(row.status);
      if (row.status === "processed" && row.transcript) {
        doneRef.current = true;
        onText(row.transcript);
        setQr(null);
        setSessionId(null);
        toast.success("Transcrição da foto adicionada. Revise antes de analisar.");
      }
    };

    const channel = supabase
      .channel(`upload-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "upload_sessions", filter: `id=eq.${sessionId}` },
        (payload) => apply(payload.new as { status: string; transcript: string | null }),
      )
      .subscribe();

    // Fallback: alguns ambientes bloqueiam websocket.
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("upload_sessions")
        .select("status, transcript")
        .eq("id", sessionId)
        .maybeSingle();
      if (data) apply(data);
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [sessionId, onText]);

  if (!sessionId) {
    return (
      <button
        onClick={start}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft transition-colors hover:border-sun disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4 text-sun-deep" />}
        Enviar foto da resolução
      </button>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border border-line bg-paper p-3">
      {qr && <img src={qr} alt="QR code para enviar a foto pelo celular" className="size-28 rounded bg-white p-1" />}
      <div className="text-xs text-ink-soft">
        <p className="font-medium text-ink">Aponte a câmera do celular</p>
        <p className="mt-1">
          {status === "uploaded"
            ? "Foto recebida, transcrevendo…"
            : status === "error"
              ? "Falhou ao ler a foto. Gere um novo QR."
              : "Aguardando a foto…"}
        </p>
        <button
          onClick={() => {
            setSessionId(null);
            setQr(null);
          }}
          className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] hover:text-sun-deep"
        >
          cancelar
        </button>
      </div>
    </div>
  );
}
