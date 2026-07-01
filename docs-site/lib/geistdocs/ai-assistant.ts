export const suggestions = [
  "How do I start using sdl?",
  "What are Objectives?",
  "How does Branch Memory work?",
  "How do worktree slots help parallel branches?",
  "How do I triage PR feedback?",
];

export const agent = {
  product: {
    name: "sdl",
    description:
      "A composable toolkit for plan-oriented agentic engineering: planning work, implementing it in isolated environments, and carrying context across sessions.",
    category: "Agentic engineering toolkit",
    audience: ["developers using coding agents", "teams coordinating multi-session engineering work"],
    useCases: [
      "Plan implementation work as durable Objectives and enriched plans",
      "Run concurrent branches in isolated worktree slots",
      "Carry branch-scoped context through Branch Memory and handoffs",
    ],
  },
  instructions: [
    "Use /sitemap.md to identify the most relevant sdl documentation pages before answering broad questions.",
    "Fetch focused documentation pages with /llms.mdx/<slug>, or use /llms.txt when the complete published corpus is useful.",
    "When verifying sdl CLI behavior, prefer documented --json or Clinkr-style machine output where available.",
    "Do not assume root docs/ are public product docs; sdl's repo-root docs/ tree is internal engineering documentation.",
  ],
};

export const prompt =
  "You are a helpful assistant specializing in sdl, a composable toolkit for plan-oriented agentic engineering. You help users plan implementation work, use isolated worktree slots, and carry context across agent sessions.";
