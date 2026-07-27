// source.config.ts
import {
  geistShikiTheme,
  geistdocsFrontmatterSchema,
  geistdocsMetaSchema
} from "@vercel/geistdocs/source-config";
import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import lastModified from "fumadocs-mdx/plugins/last-modified";
function remarkNormalizeCodeLang() {
  return function normalizeCodeLang(tree) {
    const validLang = /^[a-zA-Z][a-zA-Z0-9+#-]*$/;
    function walk(node) {
      if (!node || typeof node !== "object") return;
      const candidate = node;
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
var docs = defineDocs({
  dir: "docs",
  docs: {
    files: ["**/*.{md,mdx}", "!README.md"],
    schema: geistdocsFrontmatterSchema,
    postprocess: {
      includeProcessedMarkdown: true
    }
  },
  meta: {
    schema: geistdocsMetaSchema
  }
});
var lastModifiedVersionControl = process.env.VERCEL === "1" ? async () => null : "git";
var source_config_default = defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid, remarkNormalizeCodeLang],
    rehypeCodeOptions: {
      themes: {
        light: geistShikiTheme,
        dark: geistShikiTheme
      },
      defaultColor: "light"
    }
  },
  plugins: [lastModified({ versionControl: lastModifiedVersionControl })]
});
export {
  source_config_default as default,
  docs
};
