import { productName } from "@/lib/geistdocs/site-identity";

export const suggestions = [
  "How do I start using ns?",
  "What is the ns kernel?",
  "What are Objectives?",
  "How do worktree slots help parallel branches?",
  "What extensions are available?",
];

export const agent = {
  product: {
    name: productName,
    description:
      "The kernel for nonslop engineering: durable planning intent, scoped branch memory, isolated worktree slots, and git-native shipping — embeddable in the coding harnesses you already use, with an extension ecosystem built on top.",
    category: "Agentic engineering kernel",
    audience: ["developers using coding agents", "teams coordinating multi-session engineering work"],
    useCases: [
      "Plan implementation work as durable Objectives and enriched plans",
      "Run concurrent branches in isolated worktree slots",
      "Carry branch-scoped context across sessions and agents",
      "Extend the kernel with extensions like retrospectives, review roasts, and PR-feedback triage",
    ],
  },
  instructions: [
    "Use /sitemap.md to identify the most relevant ns documentation pages before answering broad questions.",
    "Fetch focused documentation pages with /llms.mdx/<slug>, or use /llms.txt when the complete published corpus is useful.",
    "When verifying ns CLI behavior, prefer documented --json or Clinkr-style machine output where available.",
    "Do not assume root docs/ are public product docs; the repo-root docs/ tree is internal engineering documentation.",
  ],
};

export const prompt =
  `You are a helpful assistant specializing in ${productName}, the kernel for nonslop engineering. You help users plan work as durable Objectives, run branches in isolated worktree slots, carry context across agent sessions, and build on the ${productName} extension ecosystem.`;
