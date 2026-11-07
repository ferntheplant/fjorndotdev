import { defineConfig } from "vite-plus";

// The site's commands that must run every time. The root config caches every script
// (`run.cache: true`), and only a task can opt out with `cache: false`: a dev or preview server
// never finishes, `good:add` fetches a page and writes src/data/good.yaml, and `deploy:prod`
// must deploy even when no file changed.
export default defineConfig({
  run: {
    tasks: {
      "deploy:prod": { cache: false, command: "alchemy deploy --stage prod" },
      dev: { cache: false, command: "astro dev" },
      "good:add": { cache: false, command: "node scripts/good.ts" },
      "preview:astro": { cache: false, command: "astro preview" },
      "preview:cf": { cache: false, command: "alchemy dev" },
    },
  },
});
