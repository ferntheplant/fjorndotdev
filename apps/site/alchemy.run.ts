import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

// The fjorn.dev site as a Cloudflare Worker: Astro builds to static output,
// and every request is answered by the asset layer (no server bundle).
// The `domain` is served from the Cloudflare zone in this account; Alchemy
// creates the DNS record and edge certificate on deploy. The old Vercel A
// record must be deleted before the attach can succeed.
export default Alchemy.Stack(
  "fjorndotdev",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* deploySite() {
    const site = yield* Cloudflare.Website.Astro("Site", {
      assets: {
        htmlHandling: "auto-trailing-slash",
        notFoundHandling: "404-page",
      },
      astro: { output: "static" },
      compatibility: { date: "2026-10-01" },
      domain: "fjorn.dev",
      name: "fjorndotdev",
      // Keep prerendering on Node, identical to `astro build` today.
      // Alchemy's default renders pages in workerd; revisit once live.
      prerenderEnvironment: "node",
    });

    return { url: site.url };
  })
);
