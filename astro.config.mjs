// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import react from "@astrojs/react";

import { unified } from "@astrojs/markdown-remark";
import remarkMath from "remark-math";
import remarkToc from "remark-toc";
import rehypeKatex from "rehype-katex";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import rehypeInlineFootnotes from "./plugins/rehype-inline-footnotes.js";

import mdx from "@astrojs/mdx";
import gfm from "remark-gfm";

// https://astro.build/config
export default defineConfig({
  site: "https://fjorn.dev",
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    // Astro 7 defaults to the Sätteri pipeline, which ignores remark/rehype plugins.
    // Without remark-math, MDX parses `{...}` inside LaTeX as JS expressions.
    processor: unified({
      remarkPlugins: [gfm, remarkMath, [remarkToc, { heading: "Contents" }]],
      rehypePlugins: [
        rehypeKatex,
        rehypeSlug,
        [rehypeAutolinkHeadings, { behavior: "wrap" }],
        rehypeInlineFootnotes,
      ],
    }),
    shikiConfig: {
      themes: {
        light: "catppuccin-latte",
        dark: "catppuccin-macchiato",
      },
      defaultColor: "light-dark()",
      wrap: false,
    },
  },
  integrations: [
    react(),
    // Inherits the unified() processor and its plugins from `markdown`.
    mdx(),
  ],
});
