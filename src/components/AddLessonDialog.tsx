import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { subjects } from "@/data/subjects";
import { addCustomLesson, isoToShortDate } from "@/lib/custom-lessons";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSubject: string;
};

const field =
  "w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-sun";
const label = "font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft";

export function AddLessonDialog({ open, onOpenChange, defaultSubject }: Props) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState(defaultSubject);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [professor, setProfessor] = useState("");
  const [frente, setFrente] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Dê um título para a aula.");
      return;
    }
    setSaving(true);
    try {
      await addCustomLesson({
        subject,
        date: isoToShortDate(date),
        professor: professor.trim(),
        frente: frente.trim(),
        title: title.trim(),
        url: url.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ["custom-lessons"] });
      toast.success("Aula adicionada.");
      setTitle("");
      setUrl("");
      onOpenChange(false);
    } catch {
      toast.error("Não foi possível salvar a aula.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Adicionar aula</DialogTitle>
          <DialogDescription>
            A aula entra no catálogo da matéria escolhida, com resumo, revisão e link.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className={label}>Matéria</p>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={`mt-1 ${field}`}
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className={label}>Data</p>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`mt-1 ${field}`}
              />
            </div>
          </div>

          <div>
            <p className={label}>Título</p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Termoquímica II"
              className={`mt-1 ${field}`}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className={label}>Professor</p>
              <input
                value={professor}
                onChange={(e) => setProfessor(e.target.value)}
                placeholder="Opcional"
                className={`mt-1 ${field}`}
              />
            </div>
            <div>
              <p className={label}>Frente</p>
              <input
                value={frente}
                onChange={(e) => setFrente(e.target.value)}
                placeholder="Ex.: 2"
                className={`mt-1 ${field}`}
              />
            </div>
          </div>

          <div>
            <p className={label}>Link da gravação</p>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className={`mt-1 ${field}`}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-line px-3 py-2 text-sm text-ink-soft"
            >
              cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-sun px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving ? "salvando…" : "adicionar aula"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
