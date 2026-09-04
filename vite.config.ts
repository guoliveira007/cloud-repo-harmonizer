// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    plugins: [
      {
        name: "normalize-generated-supabase-env-access",
        // Run after Lovable's managed env plugin so bracket notation left behind
        // is normalized before Vite replaces public environment variables.
        enforce: "post",
        transform(code, id) {
          const cleanId = id.split("?", 1)[0]?.replaceAll("\\", "/");
          if (!cleanId?.endsWith("/src/integrations/supabase/client.ts")) return null;

          const normalized = code
            .replace(
              /import\.meta\.env\[['"]VITE_SUPABASE_URL['"]\]/g,
              "import.meta.env.VITE_SUPABASE_URL",
            )
            .replace(
              /import\.meta\.env\[['"]VITE_SUPABASE_PUBLISHABLE_KEY['"]\]/g,
              "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY",
            );

          return normalized === code ? null : { code: normalized, map: null };
        },
      },
    ],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
