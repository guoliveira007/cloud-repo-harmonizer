// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// These are public browser credentials, not secrets. The managed remote build
// currently exposes their unprefixed variants only to the server runtime, so
// keep a build-safe fallback for the generated browser client.
const PUBLIC_SUPABASE_URL = "https://obhjbvtvicarnxzkieoo.supabase.co";
const PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_YPcMqjCcKDQw6LOtMyEAPQ_0esReKea";

function injectGeneratedSupabasePublicEnv() {
  let supabaseUrl =
    process.env["VITE_SUPABASE_URL"] ??
    process.env["SUPABASE_URL"] ??
    PUBLIC_SUPABASE_URL;
  let supabasePublishableKey =
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_PUBLISHABLE_KEY"] ??
    PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return {
    name: "inject-generated-supabase-public-env",
    enforce: "pre" as const,
    configResolved(config: {
      env: Record<string, string | undefined>;
    }) {
      supabaseUrl ??= config.env["VITE_SUPABASE_URL"];
      supabasePublishableKey ??=
        config.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    },
    transform(code: string, id: string) {
      const cleanId = id.split("?", 1)[0]?.replaceAll("\\", "/");
      if (!cleanId?.endsWith("/src/integrations/supabase/client.ts")) return null;
      if (!supabaseUrl || !supabasePublishableKey) return null;

      const transformed = code
        .replace(
          /import\.meta\.env(?:\.VITE_SUPABASE_URL|\[['"]VITE_SUPABASE_URL['"]\])/g,
          JSON.stringify(supabaseUrl),
        )
        .replace(
          /import\.meta\.env(?:\.VITE_SUPABASE_PUBLISHABLE_KEY|\[['"]VITE_SUPABASE_PUBLISHABLE_KEY['"]\])/g,
          JSON.stringify(supabasePublishableKey),
        );

      return transformed === code ? null : { code: transformed, map: null };
    },
  };
}

export default defineConfig({
  vite: {
    plugins: [injectGeneratedSupabasePublicEnv()],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
