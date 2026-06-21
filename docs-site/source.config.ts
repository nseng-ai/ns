import {
  geistShikiTheme,
  geistdocsFrontmatterSchema,
  geistdocsMetaSchema,
} from "@vercel/geistdocs/source-config";
import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import lastModified, { type LastModifiedPluginOptions } from "fumadocs-mdx/plugins/last-modified";

function remarkNormalizeCodeLang() {
  return function normalizeCodeLang(tree: { children?: unknown[] }) {
    const validLang = /^[a-zA-Z][a-zA-Z0-9+#-]*$/;

    function walk(node: unknown) {
      if (!node || typeof node !== "object") return;

      const candidate = node as {
        children?: unknown[];
        lang?: string;
        meta?: string;
        type?: string;
      };

      if (candidate.type === "code" && typeof candidate.lang === "string" && !validLang.test(candidate.lang)) {
        candidate.meta = candidate.meta ? `${candidate.lang} ${candidate.meta}` : candidate.lang;
        candidate.lang = "text";
      }

      if (!Array.isArray(candidate.children)) return;
      for (const child of candidate.children) walk(child);
    }

    walk(tree);
  };
}

export const docs = defineDocs({
  dir: "docs",
  docs: {
    files: ["**/*.{md,mdx}", "!README.md"],
    schema: geistdocsFrontmatterSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: geistdocsMetaSchema,
  },
});

const lastModifiedVersionControl: LastModifiedPluginOptions["versionControl"] =
  process.env.VERCEL === "1" ? async () => null : "git";

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid, remarkNormalizeCodeLang],
    rehypeCodeOptions: {
      themes: {
        light: geistShikiTheme,
        dark: geistShikiTheme,
      },
      defaultColor: "light",
    },
  },
  plugins: [lastModified({ versionControl: lastModifiedVersionControl })],
});
