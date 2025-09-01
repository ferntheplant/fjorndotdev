// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import react from "@astrojs/react";
import vercel from "@astrojs/vercel";

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
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
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
    mdx({
      remarkPlugins: [gfm, remarkMath, [remarkToc, { heading: "Contents" }]],
      rehypePlugins: [
        rehypeKatex,
        rehypeSlug,
        [rehypeAutolinkHeadings, { behavior: "wrap" }],
        rehypeInlineFootnotes,
      ],
    }),
  ],
  adapter: vercel(),
});
