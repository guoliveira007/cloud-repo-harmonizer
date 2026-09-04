import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { LogOut, PanelLeftClose, PanelLeftOpen, Trophy } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useViewer } from "@/components/SplitView";
import { ensureUserSetup, fetchSubjects, subjectTree } from "@/lib/study";
import { supabase } from "@/integrations/supabase/client";
import { RewardsDialog } from "@/components/RewardsDialog";
import { RewardWatcher } from "@/components/RewardWatcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


const NAV = [
  { to: "/", label: "Visão geral" },
  { to: "/aulas", label: "Aulas" },
  { to: "/flashcards", label: "Flashcards" },
  { to: "/biblioteca", label: "Biblioteca" },
  { to: "/quizzes", label: "Quizzes" },
  { to: "/simulados", label: "Simulados" },
  { to: "/praticar", label: "Praticar" },
  { to: "/revisoes", label: "Revisões" },
  { to: "/nuvem", label: "Nuvem" },
] as const;



export function AppShell({ children }: { children: ReactNode }) {
  return <AppShellInner>{children}</AppShellInner>;
}


function AppShellInner({ children }: { children: ReactNode }) {
  const { item: openItem, full } = useViewer();
  const item = openItem && !full ? openItem : null;
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);


  useEffect(() => {
    if (!loading && !user) navigate({ to: "/entrar" });
  }, [loading, user, navigate]);

  const { data: setup, isLoading: setupLoading } = useQuery({
    queryKey: ["setup", user?.id],
    queryFn: ensureUserSetup,
    enabled: !!user,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (setup === "created") queryClient.invalidateQueries();
  }, [setup, queryClient]);

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects"],
    queryFn: fetchSubjects,
    enabled: !!user && !setupLoading,
  });


  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name,goal")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">Carregando…</p>
      </div>
    );
  }

  const name = profile?.display_name ?? user.email?.split("@")[0] ?? "Estudante";
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div className={item ? "split-mode min-h-screen text-ink lg:w-1/2" : "min-h-screen text-ink"}>
      <div className="flex">
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            aria-label="Expandir menu"
            title="Expandir menu"
            className="sticky top-0 hidden h-screen w-11 shrink-0 items-start justify-center border-r border-line bg-card/60 pt-6 text-ink-soft transition-colors hover:text-sun-deep lg:flex"
          >
            <PanelLeftOpen className="size-5" />
          </button>
        )}
        <aside
          className={
            collapsed
              ? "hidden"
              : item
                ? "sticky top-0 hidden h-screen w-52 shrink-0 flex-col border-r border-line bg-card/60 px-3 py-6 lg:flex"
                : "sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-card/60 px-4 py-6 lg:flex"
          }
        >
          <div className="flex items-center gap-2 px-2">
            <Link to="/" className="flex min-w-0 items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-sun font-display text-sm font-bold text-primary-foreground">
                F
              </span>
              <span className="truncate font-display text-lg font-bold tracking-tight">Fichário</span>
            </Link>
            <button
              onClick={() => setCollapsed(true)}
              aria-label="Recolher menu"
              title="Recolher menu"
              className="ml-auto text-ink-soft transition-colors hover:text-sun-deep"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </div>

          <nav className="mt-8 space-y-1 text-sm">
            {NAV.map((item) => {
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={
                    active
                      ? "flex items-center gap-2 rounded-md bg-sun/15 px-3 py-2 font-semibold text-sun-deep"
                      : "flex items-center gap-2 rounded-md px-3 py-2 text-ink-soft transition-colors hover:bg-card"
                  }
                >
                  {active && <span className="size-1.5 rounded-full bg-sun" />}
                  {item.label}
                </Link>
              );
            })}
          </nav>


          <div className="sidebar-scroll mt-6 min-h-0 flex-1 overflow-y-auto">
            <p className="px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              Matérias
            </p>
            <div className="mt-2 space-y-0.5 text-sm">
              {subjectTree(subjects).map(({ subject: s, children }) => {
                const active = pathname === `/materia/${s.id}`;
                return (
                  <div key={s.id}>
                    <Link
                      to="/materia/$id"
                      params={{ id: s.id }}
                      className={
                        active
                          ? "flex w-full items-center gap-2 rounded-md bg-card px-3 py-2 font-medium"
                          : "flex w-full items-center gap-2 rounded-md px-3 py-2 text-ink-soft transition-colors hover:bg-card"
                      }
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: s.color }}
                      />
                      {s.name}
                    </Link>
                    {children.length > 0 && (
                      <div className="ml-4 border-l border-line pl-2">
                        {children.map((c) => {
                          const cActive = pathname === `/materia/${c.id}`;
                          const short = c.name
                            .replace(`${s.name} (`, "")
                            .replace(/\)$/, "");
                          return (
                            <Link
                              key={c.id}
                              to="/materia/$id"
                              params={{ id: c.id }}
                              className={
                                cActive
                                  ? "block rounded-md bg-card px-3 py-1.5 text-[13px] font-medium"
                                  : "block rounded-md px-3 py-1.5 text-[13px] text-ink-soft transition-colors hover:bg-card"
                              }
                            >
                              {short}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>


          <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Abrir menu do perfil"
                  title="Perfil e recompensas"
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-line font-mono text-[11px] text-ink-soft transition-colors hover:bg-sun/20 hover:text-sun-deep"
                >
                  {initials}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-48">
                <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setRewardsOpen(true)}>
                  <Trophy className="size-4" />
                  Recompensas
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()}>
                  <LogOut className="size-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-semibold">{name}</p>
              <p className="font-mono text-[10px] text-ink-soft">{profile?.goal ?? "ENEM 2026"}</p>
            </div>
            <button
              onClick={() => setRewardsOpen(true)}
              aria-label="Recompensas"
              title="Recompensas"
              className="ml-auto text-ink-soft transition-colors hover:text-sun-deep"
            >
              <Trophy className="size-4" />
            </button>
          </div>

        </aside>

        <main className={item ? "min-w-0 flex-1 px-4 py-6 lg:px-6" : "min-w-0 flex-1 px-6 py-6 lg:px-10 lg:py-8"}>
          <div className="mb-6 flex items-center gap-2 overflow-x-auto lg:hidden">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={
                  pathname === item.to
                    ? "shrink-0 rounded-md bg-sun px-3 py-1.5 text-sm font-semibold text-primary-foreground"
                    : "shrink-0 rounded-md border border-line bg-card px-3 py-1.5 text-sm text-ink-soft"
                }
              >
                {item.label}
              </Link>
            ))}
            <button
              onClick={() => setRewardsOpen(true)}
              aria-label="Recompensas"
              className="shrink-0 rounded-md border border-line bg-card px-3 py-1.5 text-sm text-ink-soft"
            >
              <Trophy className="size-4" />
            </button>
          </div>

          {children}
        </main>
      </div>
      <RewardsDialog open={rewardsOpen} onOpenChange={setRewardsOpen} />
      {user && <RewardWatcher userId={user.id} />}
    </div>

  );
}
