import { unified } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import gfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkToc from "remark-toc";

import rehypeInlineFootnotes from "./src/lib/rehype-inline-footnotes.ts";

// https://astro.build/config
export default defineConfig({
  integrations: [
    react(),
    // Inherits the unified() processor and its plugins from `markdown`.
    mdx(),
  ],
  markdown: {
    // Astro 7 defaults to the Sätteri pipeline, which ignores remark/rehype plugins.
    // Without remark-math, MDX parses `{...}` inside LaTeX as JS expressions.
    processor: unified({
      rehypePlugins: [
        rehypeKatex,
        rehypeSlug,
        [rehypeAutolinkHeadings, { behavior: "wrap" }],
        rehypeInlineFootnotes,
      ],
      remarkPlugins: [gfm, remarkMath, [remarkToc, { heading: "Contents" }]],
    }),
    shikiConfig: {
      defaultColor: "light-dark()",
      themes: {
        dark: "catppuccin-macchiato",
        light: "catppuccin-latte",
      },
      wrap: false,
    },
  },
  site: "https://fjorn.dev",
  vite: {
    plugins: [tailwindcss()],
  },
});
