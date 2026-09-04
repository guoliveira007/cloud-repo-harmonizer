import { Link } from "@tanstack/react-router";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renderiza o plano de revisão em markdown com a tipografia do fichário. */
export function StudyPlanContent({ content }: { content: string }) {
  return (
    <div className="space-y-5 text-sm leading-relaxed text-ink-soft">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h3 className="font-display text-lg font-bold text-ink">{children}</h3>
          ),
          h2: ({ children }) => (
            <h3 className="mt-6 flex items-center gap-3 font-display text-base font-semibold text-ink first:mt-0">
              <span className="h-4 w-1 rounded-full bg-sun" />
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-4 font-display text-sm font-semibold text-ink">{children}</h4>
          ),
          p: ({ children }) => <p className="mt-2">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
          ul: ({ children }) => <ul className="mt-3 space-y-2">{children}</ul>,
          ol: ({ children }) => <ol className="mt-3 space-y-2">{children}</ol>,
          li: ({ children }) => (
            <li className="relative rounded-lg border border-line bg-card px-4 py-2.5 pl-9 before:absolute before:left-3.5 before:top-[1.15rem] before:size-1.5 before:rounded-full before:bg-sun">
              {children}
            </li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mt-3 border-l-2 border-sun/60 bg-sun/5 px-4 py-2 italic">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-line px-1.5 py-0.5 font-mono text-xs text-ink">{children}</code>
          ),
          hr: () => <hr className="my-5 border-line" />,
          a: ({ children, href }) => {
            const to = href ?? "";
            const internal = to.startsWith("/materia/");
            if (internal) {
              const id = to.slice("/materia/".length);
              return (
                <Link
                  to="/materia/$id"
                  params={{ id }}
                  className="font-semibold text-sun-deep underline-offset-4 hover:underline"
                >
                  {children}
                </Link>
              );
            }
            return (
              <a href={to} className="text-sun-deep underline-offset-4 hover:underline">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
