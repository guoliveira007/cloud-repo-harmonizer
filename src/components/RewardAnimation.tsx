import { useEffect, useState } from "react";
import { X } from "lucide-react";

import aprovado from "@/assets/reward-aprovado.jpg";
import arcadas from "@/assets/reward-arcadas.jpg";
import bustoArnaldo from "@/assets/reward-busto-arnaldo.jpg";
import bustoOctavio from "@/assets/reward-busto-octavio.jpg";
import fachadaNoite from "@/assets/reward-fachada-noite.jpg";
import portaoFmusp from "@/assets/reward-portao-fmusp.jpg";
import epm11961 from "@/assets/reward-x-epm-11961.jpg";
import epmAnatomia from "@/assets/reward-x-epm-anatomia.jpg";
import epmFachada2026 from "@/assets/reward-x-epm-fachada-2026.jpg";
import epmHspFachada from "@/assets/reward-x-epm-hsp-fachada.jpg";
import epmLeitao from "@/assets/reward-x-epm-leitao.jpg";
import epmLustre from "@/assets/reward-x-epm-lustre.jpg";
import epmOctavioAlta from "@/assets/reward-x-epm-octavio-alta.jpg";
import fmusp17 from "@/assets/reward-x-fmusp-17.jpg";
import fmusp18 from "@/assets/reward-x-fmusp-18.jpg";
import fmusp1935 from "@/assets/reward-x-fmusp-1935.jpg";
import fmusp2025a from "@/assets/reward-x-fmusp-2025a.jpg";
import fmusp2025b from "@/assets/reward-x-fmusp-2025b.jpg";
import fmusp8 from "@/assets/reward-x-fmusp-8.jpg";
import fmuspAerea1 from "@/assets/reward-x-fmusp-aerea-1.jpg";
import fmuspAerea2 from "@/assets/reward-x-fmusp-aerea-2.jpg";
import fmuspAerea2000 from "@/assets/reward-x-fmusp-aerea-2000.png";
import fmuspHaberkorn from "@/assets/reward-x-fmusp-haberkorn.jpg";
import fmuspParcial from "@/assets/reward-x-fmusp-parcial.jpg";
import hcAntigo from "@/assets/reward-x-hc-antigo.jpg";
import hcEntrada from "@/assets/reward-x-hc-entrada.jpg";
import hcGrafitti from "@/assets/reward-x-hc-grafitti.jpg";
import hcIcesp from "@/assets/reward-x-hc-icesp.jpg";
import unifespCampusSp from "@/assets/reward-x-unifesp-campus-sp.jpg";
import unifespHemocentro from "@/assets/reward-x-unifesp-hemocentro.jpg";
import unifespHsp from "@/assets/reward-x-unifesp-hsp.jpg";
import unifespHsp1 from "@/assets/reward-x-unifesp-hsp1.jpg";
import unifespPesquisas2 from "@/assets/reward-x-unifesp-pesquisas2.jpg";
import unifespReitoria from "@/assets/reward-x-unifesp-reitoria.jpg";
import unifespRim from "@/assets/reward-x-unifesp-rim.jpg";
import unifespVilaClementino from "@/assets/reward-x-unifesp-vila-clementino.jpg";
import { EXTRA_REWARDS, type RewardId, type Stats } from "@/lib/rewards";


const CONFETTI = Array.from({ length: 70 }, (_, i) => ({
  left: (i * 31) % 100,
  delay: (i % 14) * 0.16,
  dur: 2.2 + ((i * 7) % 22) / 10,
  size: 5 + ((i * 5) % 9),
  rot: (i * 47) % 360,
  drift: ((i % 5) - 2) * 40,
}));

const SPARKS = Array.from({ length: 18 }, (_, i) => ({
  angle: (i * 360) / 18,
  delay: (i % 6) * 0.12,
  dist: 120 + ((i * 13) % 70),
}));

/** Animação de recompensa em tela cheia, com cenas em etapas. */
export function RewardAnimation({
  id,
  celebrate = false,
  autoCloseMs,
  onClose,
}: {
  id: RewardId;
  celebrate?: boolean;
  /** fecha sozinho depois de N ms (usado na celebração automática) */
  autoCloseMs?: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!autoCloseMs) return;
    const t = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(t);
  }, [autoCloseMs, onClose, id]);

  return (
    <div className="reward-stage fixed inset-0 z-[80] grid place-items-center overflow-hidden bg-background/95 backdrop-blur-sm">
      <span className="reward-aura pointer-events-none absolute size-[70vmin] rounded-full" />
      <span className="reward-rays pointer-events-none absolute size-[140vmax]" />
      <button
        onClick={onClose}
        aria-label="Fechar animação"
        className="absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full border border-line bg-card text-ink-soft transition-colors hover:text-sun-deep"
      >
        <X className="size-4" />
      </button>
      {celebrate && (
        <p className="reward-title absolute top-6 left-1/2 z-10 -translate-x-1/2 rounded-full border border-sun/60 bg-sun/15 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em] text-sun-deep">
          recompensa desbloqueada
        </p>
      )}
      {autoCloseMs ? (
        <span
          className="pointer-events-none absolute inset-x-0 top-0 z-10 block h-1 origin-left bg-sun-deep"
          style={{ animation: `reward-countdown ${autoCloseMs}ms linear forwards` }}
        />
      ) : null}
      <Scene id={id} />
    </div>
  );
}

function Confetti({ dense = false }: { dense?: boolean }) {
  const list = dense ? CONFETTI : CONFETTI.slice(0, 40);
  return (
    <div className="pointer-events-none absolute inset-0">
      {list.map((c, i) => (
        <span
          key={i}
          className="reward-confetti absolute top-[-8%] block"
          style={{
            left: `${c.left}%`,
            width: c.size,
            height: i % 4 === 0 ? c.size : c.size * 1.8,
            borderRadius: i % 4 === 0 ? "50%" : 2,
            background:
              i % 3 === 0 ? "var(--primary)" : i % 3 === 1 ? "var(--streak)" : "var(--sun-deep)",
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.dur}s`,
            ["--drift" as string]: `${c.drift}px`,
            ["--spin" as string]: `${c.rot + 720}deg`,
          }}
        />
      ))}
    </div>
  );
}

function Sparks() {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      {SPARKS.map((s, i) => (
        <span
          key={i}
          className="reward-spark absolute block size-1.5 rounded-full bg-sun-deep"
          style={{
            ["--a" as string]: `${s.angle}deg`,
            ["--d" as string]: `${s.dist}px`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Fileira de chamas (metas de sequência). */
function Flames({ count = 7 }: { count?: number }) {
  return (
    <div className="absolute inset-x-0 top-4 flex justify-center gap-2">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="reward-flame block text-2xl drop-shadow"
          style={{ animationDelay: `${i * 0.16}s` }}
        >
          🔥
        </span>
      ))}
    </div>
  );
}

/** Linha de ECG (metas de questões). */
function EcgLine() {
  return (
    <svg viewBox="0 0 300 60" className="mt-6 h-14 w-[min(80vw,420px)] text-primary" aria-hidden="true">
      <path
        className="reward-ecg"
        d="M0 30 H60 l10 -22 l10 44 l10 -22 H150 l10 -14 l8 28 l8 -14 H300"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Contador que sobe até um valor. */
function Count({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1400);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return (
    <span className="font-mono tabular-nums">
      {n.toLocaleString("pt-BR")}
      {suffix}
    </span>
  );
}

/** Cartaz ilustrado com movimento de câmera (ken burns) e brilho passando. */
function Poster({
  src,
  alt,
  caption,
  motion = "out",
  wide = true,
  children,
}: {
  src: string;
  alt: string;
  caption: string;
  motion?: "in" | "out";
  wide?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-motion={motion}
      className={`reward-poster rounded-2xl border border-line bg-card ${
        wide ? "w-[min(92vw,720px)]" : "w-[min(80vw,420px)]"
      }`}
    >
      <img
        src={src}
        alt={alt}
        loading="eager"
        decoding="async"
        className={`block w-full object-cover ${wide ? "aspect-[16/10]" : "aspect-square"}`}
      />
      <span className="reward-vignette pointer-events-none" />
      <span className="reward-sweep pointer-events-none" />
      {children}
      <p className="absolute inset-x-0 bottom-0 p-4 text-left font-mono text-[10px] uppercase tracking-[0.22em] text-white/85">
        {caption}
      </p>
    </div>
  );
}

type Photo = { src: string; alt: string; caption: string };

/**
 * Acervo de fotos reais da FMUSP, do HC-FMUSP e da EPM/Unifesp.
 * Cada recompensa recebe uma foto própria deste pool (36 imagens).
 */
const PHOTOS: Photo[] = [
  { src: portaoFmusp, alt: "Entrada da Faculdade de Medicina da USP", caption: "entrada · fmusp · foto: wikimedia commons (cc by-sa)" },
  { src: fachadaNoite, alt: "Fachada da Faculdade de Medicina da USP", caption: "fachada · fmusp · foto: wikimedia commons (cc by-sa)" },
  { src: bustoArnaldo, alt: "Edifício da FMUSP na Av. Dr. Arnaldo", caption: "av. dr. arnaldo, 455 · fmusp · foto: wikimedia commons (cc by-sa)" },
  { src: bustoOctavio, alt: "Prédio Octávio de Carvalho, EPM/Unifesp", caption: "prédio octávio de carvalho · epm/unifesp · foto: wikimedia commons (cc by-sa)" },
  { src: arcadas, alt: "Arcadas da Faculdade de Medicina da USP", caption: "arcadas · fmusp · foto: wikimedia commons (cc by-sa)" },
  { src: aprovado, alt: "Fachada da Escola Paulista de Medicina", caption: "epm/unifesp · foto: wikimedia commons (cc by)" },
  { src: fmuspAerea1, alt: "Vista aérea da Faculdade de Medicina da USP", caption: "vista aérea · fmusp · foto: wikimedia commons (cc by-sa)" },
  { src: fmuspAerea2, alt: "Vista aérea do conjunto da FMUSP e do Hospital das Clínicas", caption: "vista aérea · fmusp/hc · foto: wikimedia commons (cc by-sa)" },
  { src: fmusp17, alt: "Estátua em frente à Faculdade de Medicina da USP", caption: "estátua · fmusp · foto: wikimedia commons (cc by-sa)" },
  { src: fmusp18, alt: "Placa comemorativa na Faculdade de Medicina da USP", caption: "placa histórica · fmusp · foto: wikimedia commons (cc by-sa)" },
  { src: fmusp8, alt: "Arredores da Faculdade de Medicina da USP", caption: "campus · fmusp · foto: wikimedia commons (cc by-sa)" },
  { src: fmusp2025a, alt: "Placa do Américo de Dias Enérgico de Sousa Lins na FMUSP", caption: "homenagem · fmusp · foto: wikimedia commons (cc by-sa)" },
  { src: fmusp2025b, alt: "Painel histórico no interior da FMUSP", caption: "painel histórico · fmusp · foto: wikimedia commons (cc by-sa)" },
  { src: fmusp1935, alt: "Vista aérea histórica da Faculdade de Medicina, em preto e branco", caption: "vista histórica · fmusp · foto: wikimedia commons (domínio público)" },
  { src: fmuspHaberkorn, alt: "Foto histórica da Faculdade de Medicina por Werner Haberkorn", caption: "acervo museu paulista · fmusp · foto: wikimedia commons (domínio público)" },
  { src: fmuspParcial, alt: "Vista parcial histórica da Faculdade de Medicina da USP", caption: "vista parcial · fmusp · foto: wikimedia commons (domínio público)" },
  { src: fmuspAerea2000, alt: "Vista aérea da Faculdade de Medicina da USP na década de 2000", caption: "anos 2000 · fmusp · foto: wikimedia commons (cc by-sa)" },
  { src: hcEntrada, alt: "Entrada do Instituto Central do Hospital das Clínicas", caption: "instituto central · hc-fmusp · foto: wikimedia commons (cc by-sa)" },
  { src: hcIcesp, alt: "Interior do Instituto do Câncer do Estado de São Paulo", caption: "icesp · hc-fmusp · foto: wikimedia commons (cc by)" },
  { src: hcGrafitti, alt: "Grafite em homenagem aos profissionais da saúde do Hospital das Clínicas", caption: "grafite · hc-fmusp · foto: wikimedia commons (cc by-sa)" },
  { src: hcAntigo, alt: "Foto antiga do Hospital das Clínicas", caption: "arquivo histórico · hc-fmusp · foto: wikimedia commons (domínio público)" },
  { src: epmFachada2026, alt: "Fachada da Escola Paulista de Medicina", caption: "fachada · epm/unifesp · foto: wikimedia commons (cc by-sa)" },
  { src: epmHspFachada, alt: "Fachada do Hospital São Paulo, hospital universitário da EPM", caption: "hospital são paulo · epm/unifesp · foto: wikimedia commons (cc by-sa)" },
  { src: epmLeitao, alt: "Pátio interno da Escola Paulista de Medicina", caption: "pátio · epm/unifesp · foto: wikimedia commons (cc by-sa)" },
  { src: epmAnatomia, alt: "Prédio de Anatomia da Escola Paulista de Medicina", caption: "prédio de anatomia · epm/unifesp · foto: wikimedia commons (cc by-sa)" },
  { src: epmOctavioAlta, alt: "Placa do fundador Octávio de Carvalho na EPM", caption: "fundador · epm/unifesp · foto: wikimedia commons (cc by-sa)" },
  { src: epmLustre, alt: "Lustre histórico em frente à direção da EPM", caption: "lustre histórico · epm/unifesp · foto: wikimedia commons (cc by-sa)" },
  { src: epm11961, alt: "Sala de aula da Escola Paulista de Medicina", caption: "sala de aula · epm/unifesp · foto: wikimedia commons (cc by-sa)" },
  { src: unifespCampusSp, alt: "Campus São Paulo da Unifesp", caption: "campus são paulo · unifesp · foto: wikimedia commons (cc by-sa)" },
  { src: unifespPesquisas2, alt: "Edifício de Pesquisas II do Campus São Paulo da Unifesp", caption: "ed. pesquisas ii · unifesp · foto: wikimedia commons (cc by-sa)" },
  { src: unifespHemocentro, alt: "Hemocentro da Unifesp no Hospital São Paulo", caption: "hemocentro · unifesp · foto: wikimedia commons (cc by-sa)" },
  { src: unifespRim, alt: "Hospital do Rim e Hipertensão da Unifesp", caption: "hospital do rim · unifesp · foto: wikimedia commons (cc by-sa)" },
  { src: unifespHsp, alt: "Hospital São Paulo da Unifesp", caption: "hospital são paulo · unifesp · foto: wikimedia commons (cc by-sa)" },
  { src: unifespHsp1, alt: "Torres do Hospital São Paulo da Unifesp", caption: "hospital são paulo · unifesp · foto: wikimedia commons (cc by-sa)" },
  { src: unifespReitoria, alt: "Reitoria da Unifesp", caption: "reitoria · unifesp · foto: wikimedia commons (cc by-sa)" },
  { src: unifespVilaClementino, alt: "Vista aérea da Unifesp na Vila Clementino", caption: "vila clementino · unifesp · foto: wikimedia commons (cc by-sa)" },
];

/** Cenas das metas intermediárias: mesma linguagem visual, textos próprios. */
const EXTRA_SCENES: Record<string, { title: string; line: string; badge: string }> = {
  aquecimento: { title: "Aquecimento", line: "Cem cartões: o hábito já está de pé.", badge: "100 revisões" },
  "maratona-500": { title: "Maratona de revisão", line: "Quinhentas revisões depois, o conteúdo gruda.", badge: "500 revisões" },
  "mil-cartoes": { title: "Mil cartões", line: "Mil revisões — volume de aprovado.", badge: "1.000 revisões" },
  "revisor-2500": { title: "Revisor incansável", line: "Duas mil e quinhentas. Poucos aguentam.", badge: "2.500 revisões" },
  "revisor-5000": { title: "Memória de ferro", line: "Cinco mil revisões. Você não esquece mais.", badge: "5.000 revisões" },
  "chama-3": { title: "Primeira chama", line: "Três dias seguidos. Começou.", badge: "3 dias" },
  "chama-14": { title: "Duas semanas firmes", line: "Catorze dias sem quebrar o ritmo.", badge: "14 dias" },
  "chama-30": { title: "Um mês inteiro", line: "Trinta dias: isso é rotina de medicina.", badge: "30 dias" },
  "chama-60": { title: "Dois meses de fogo", line: "Sessenta dias construindo a vaga.", badge: "60 dias" },
  "chama-100": { title: "Cem dias", line: "Cem dias seguidos. Você é outro candidato.", badge: "100 dias" },
  "dominio-25": { title: "Domínio inicial", line: "Vinte e cinco cartões já são seus.", badge: "caixa 4+" },
  "dominio-250": { title: "Base sólida", line: "Duzentos e cinquenta dominados.", badge: "caixa 4+" },
  "dominio-500": { title: "Repertório amplo", line: "Quinhentos cartões na memória longa.", badge: "caixa 4+" },
  "dominio-1000": { title: "Mil dominados", line: "Mil cartões dominados. Nível segunda fase.", badge: "caixa 4+" },
  "quiz-25": { title: "Primeiros acertos", line: "Vinte e cinco questões certas.", badge: "quiz" },
  "quiz-100": { title: "Cem acertos", line: "Cem questões certas no placar.", badge: "quiz" },
  "quiz-500": { title: "Simulado vivo", line: "Quinhentos acertos: você pensa como a prova.", badge: "quiz" },
  "quiz-1000": { title: "Mil acertos", line: "Mil questões certas. Primeira chamada à vista.", badge: "quiz" },
  "leitura-5": { title: "Leitor atento", line: "Cinco materiais lidos até o fim.", badge: "biblioteca" },
  "leitura-25": { title: "Biblioteca pessoal", line: "Vinte e cinco materiais lidos.", badge: "biblioteca" },
  "leitura-60": { title: "Acervo dominado", line: "Sessenta materiais — sem atalhos.", badge: "biblioteca" },
  "pontos-1000": { title: "Mil pontos", line: "O placar começou a subir.", badge: "pontos" },
  "pontos-15000": { title: "Quinze mil pontos", line: "Consistência acumulada vira aprovação.", badge: "pontos" },
  "horas-25": { title: "25 horas", line: "Vinte e cinco horas registradas.", badge: "horas" },
  "horas-300": { title: "300 horas", line: "Trezentas horas de jaleco antes do jaleco.", badge: "horas" },
  "revisor-50": { title: "Primeiro bloco", line: "Cinquenta revisões: o começo real.", badge: "50 revisões" },
  "revisor-250": { title: "Ritmo de cursinho", line: "Duzentas e cinquenta revisões no placar.", badge: "250 revisões" },
  "revisor-750": { title: "Setecentos e cinquenta", line: "Mais que a maioria já revisou.", badge: "750 revisões" },
  "revisor-1500": { title: "Mil e quinhentas", line: "Cada revisão é um ponto na prova.", badge: "1.500 revisões" },
  "revisor-3500": { title: "Três mil e quinhentas", line: "A repetição espaçada trabalha por você.", badge: "3.500 revisões" },
  "revisor-7500": { title: "Sete mil e quinhentas", line: "Volume de primeira chamada.", badge: "7.500 revisões" },
  "revisor-10000": { title: "Dez mil revisões", line: "Dez mil. Esse é o número da vaga.", badge: "10.000 revisões" },
  "chama-7": { title: "Uma semana", line: "Sete dias seguidos: o hábito nasceu.", badge: "7 dias" },
  "chama-21": { title: "Vinte e um dias", line: "O tempo clássico de formar um hábito.", badge: "21 dias" },
  "chama-45": { title: "Quarenta e cinco dias", line: "Um bimestre sem falhar.", badge: "45 dias" },
  "chama-90": { title: "Um trimestre", line: "Noventa dias de disciplina real.", badge: "90 dias" },
  "chama-180": { title: "Meio ano", line: "Cento e oitenta dias de constância.", badge: "180 dias" },
  "chama-365": { title: "Um ano inteiro", line: "Um ano seguido. Agora é a lista.", badge: "365 dias" },
  "dominio-50": { title: "Cinquenta dominados", line: "O conteúdo já responde sozinho.", badge: "caixa 4+" },
  "dominio-150": { title: "Cento e cinquenta", line: "Memória de longo prazo ativada.", badge: "caixa 4+" },
  "dominio-750": { title: "Setecentos e cinquenta", line: "Repertório de segunda fase.", badge: "caixa 4+" },
  "dominio-1500": { title: "Mil e quinhentos", line: "Vestibular na palma da mão.", badge: "caixa 4+" },
  "dominio-2500": { title: "Enciclopédia viva", line: "Dois mil e quinhentos cartões dominados.", badge: "caixa 4+" },
  "quiz-50": { title: "Cinquenta acertos", line: "O raciocínio começa a ficar afiado.", badge: "quiz" },
  "quiz-250": { title: "Duzentos e cinquenta", line: "Consistência em prova.", badge: "quiz" },
  "quiz-750": { title: "Setecentos e cinquenta", line: "Você já sente a pegada das bancas.", badge: "quiz" },
  "quiz-2000": { title: "Dois mil acertos", line: "Treino de aprovado.", badge: "quiz" },
  "quiz-5000": { title: "Cinco mil acertos", line: "Nenhuma prova te pega de surpresa.", badge: "quiz" },
  "leitura-10": { title: "Dez materiais", line: "Teoria em dia.", badge: "biblioteca" },
  "leitura-100": { title: "Cem materiais", line: "Acervo inteiro estudado.", badge: "biblioteca" },
  "pontos-5000": { title: "Cinco mil pontos", line: "O placar ganhou corpo.", badge: "pontos" },
  "pontos-50000": { title: "Cinquenta mil pontos", line: "Placar de quem não para.", badge: "pontos" },
  "horas-100": { title: "100 horas", line: "Cem horas depositadas na sua vaga.", badge: "horas" },
  "horas-1000": { title: "Mil horas", line: "Mil horas: o jaleco é questão de tempo.", badge: "horas" },
};

type Effect = "confetti" | "confetti-dense" | "sparks" | "flames" | "ecg";

/** Efeito-base por família de estatística — cada tipo de meta ganha uma animação própria. */
const EFFECT_BY_STAT: Record<keyof Stats, Effect> = {
  reviews: "confetti",
  streak: "flames",
  learned: "sparks",
  correct: "ecg",
  materialsRead: "confetti",
  points: "confetti-dense",
  hours: "sparks",
};

/** Efeito alternativo na segunda volta do acervo, para nenhuma cena se repetir. */
const ALT_EFFECT: Record<Effect, Effect> = {
  confetti: "sparks",
  "confetti-dense": "confetti",
  sparks: "confetti",
  flames: "confetti-dense",
  ecg: "sparks",
};

const EXTRA_ORDER: string[] = EXTRA_REWARDS.map((r) => r.id);
const EXTRA_STAT = new Map<string, keyof Stats>(EXTRA_REWARDS.map((r) => [r.id, r.stat]));

function extraSceneConfig(id: string) {
  const i = Math.max(0, EXTRA_ORDER.indexOf(id));
  const secondRound = i >= PHOTOS.length;
  const photo = PHOTOS[i % PHOTOS.length]!;
  const stat = EXTRA_STAT.get(id) ?? "reviews";
  const baseEffect = EFFECT_BY_STAT[stat];
  return {
    photo,
    effect: (secondRound ? ALT_EFFECT[baseEffect] : baseEffect) as Effect,
    motion: (secondRound ? i % 2 === 0 : i % 2 !== 0) ? ("in" as const) : ("out" as const),
    wide: secondRound ? i % 3 !== 0 : i % 3 === 0 ? false : true,
    flames: 5 + (i % 5),
  };
}

function ExtraScene({ id }: { id: string }) {
  const meta = EXTRA_SCENES[id]!;
  const { photo, effect, motion, wide, flames } = extraSceneConfig(id);
  return (
    <Frame title={meta.title} line={meta.line}>
      {effect === "confetti" && <Confetti />}
      {effect === "confetti-dense" && <Confetti dense />}
      {effect === "sparks" && <Sparks />}
      <Poster
        src={photo.src}
        alt={photo.alt}
        caption={photo.caption}
        motion={motion}
        wide={wide}
      >
        {effect === "flames" && <Flames count={flames} />}
        <span className="reward-badge absolute left-4 top-4 rounded-md border border-sun/60 bg-card/85 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-sun-deep">
          {meta.badge}
        </span>
      </Poster>
      {effect === "ecg" && <EcgLine />}
    </Frame>
  );
}

function Scene({ id }: { id: RewardId }) {
  if (EXTRA_SCENES[id]) return <ExtraScene id={id} />;

  if (id === "primeiro-passo")
    return (
      <Frame title="O portão se abre" line="Quem começa hoje, atravessa esse portão depois.">
        <Sparks />
        <Poster
          src={portaoFmusp}
          alt="Foto da entrada da Faculdade de Medicina da USP"
          caption="entrada · fmusp · foto: wikimedia commons (cc by-sa)"
        >
          <span className="reward-stamp absolute right-4 top-4 rotate-[-10deg] rounded-md border-2 border-streak px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-streak">
            iniciado
          </span>
        </Poster>
        <p className="reward-late mt-6 font-mono text-xs text-ink-soft">
          <Count to={25} suffix=" cartões revisados" />
        </p>
      </Frame>
    );

  if (id === "chuva-de-aprovacao")
    return (
      <Frame title="Chuva de aprovação" line="Sete dias seguidos. É assim que se constrói uma vaga.">
        <Confetti dense />
        <Poster
          src={fachadaNoite}
          alt="Foto da fachada da Faculdade de Medicina da USP"
          caption="fachada · fmusp · foto: wikimedia commons (cc by-sa)"
        >
          <Flames count={7} />
        </Poster>
        <p className="reward-late mt-6 font-display text-4xl font-bold text-streak">
          <Count to={7} suffix=" dias" />
        </p>
      </Frame>
    );

  if (id === "jaleco-branco")
    return (
      <Frame title="Busto do Dr. Arnaldo" line="Av. Dr. Arnaldo, 455 — ele já espera por você.">
        <Sparks />
        <Poster
          src={bustoArnaldo}
          alt="Foto do edifício da Faculdade de Medicina da USP, na Av. Dr. Arnaldo"
          caption="av. dr. arnaldo, 455 · fmusp · foto: wikimedia commons (cc by-sa)"
          wide={false}
        >
          <span className="reward-badge absolute left-4 top-4 rounded-md border border-sun/60 bg-card/85 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-sun-deep">
            caixa 4+
          </span>
        </Poster>
        <p className="reward-late mt-6 font-mono text-xs text-ink-soft">
          <Count to={100} suffix=" cartões dominados" />
        </p>
      </Frame>
    );

  if (id === "estetoscopio-epm")
    return (
      <Frame title="Busto do Dr. Octávio — EPM" line="Cada questão certa é um batimento mais perto.">
        <div className="relative grid place-items-center">
          <Poster
            src={bustoOctavio}
            alt="Foto do prédio Octávio de Carvalho, na Escola Paulista de Medicina"
            caption="prédio octávio de carvalho · epm/unifesp · foto: wikimedia commons (cc by-sa)"
            wide={false}
          />
          <EcgLine />
        </div>
        <p className="reward-late mt-2 font-mono text-xs text-ink-soft">
          <Count to={200} suffix=" questões certas" />
        </p>
      </Frame>
    );

  if (id === "arcadas-fmusp")
    return (
      <Frame title="Arcadas — FMUSP" line="Entrando nas Arcadas: o corredor é seu.">
        <Confetti dense />
        <Poster
          src={arcadas}
          alt="Foto das arcadas da Faculdade de Medicina da USP"
          caption="arcadas · fmusp · foto: wikimedia commons (cc by-sa)"
          motion="in"
        />
        <p className="reward-late mt-6 font-display text-3xl font-bold text-sun-deep">
          <Count to={5000} suffix=" pts" />
        </p>
      </Frame>
    );

  return (
    <Frame title="Lista de aprovados" line="Convocado para matrícula: Medicina.">
      <Confetti dense />
      <Sparks />
      <Poster
        src={aprovado}
        alt="Foto da fachada da Escola Paulista de Medicina"
        caption="1ª chamada · epm/unifesp · foto: wikimedia commons (cc by)"
      >
        <div className="reward-paper absolute bottom-10 left-4 rounded-lg border border-line bg-card/90 p-3 text-left">
          <p className="reward-line font-mono text-[11px]">01 · FMUSP — Medicina ✅</p>
          <p className="reward-line font-mono text-[11px] [animation-delay:0.6s]">
            02 · EPM/Unifesp — Medicina ✅
          </p>
          <p className="reward-line font-mono text-[11px] text-ink-soft [animation-delay:1.2s]">
            <Count to={100} suffix=" horas registradas" />
          </p>
        </div>
      </Poster>
    </Frame>
  );
}


function Frame({
  title,
  line,
  children,
}: {
  title: string;
  line: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative grid w-full place-items-center px-6 text-center">
      {children}
      <h2 className="reward-title mt-8 font-display text-3xl font-bold tracking-tight">{title}</h2>
      <p className="reward-late mt-2 max-w-md text-sm text-ink-soft">{line}</p>
    </div>
  );
}
