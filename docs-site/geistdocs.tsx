export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="font-semibold text-gray-1000 text-lg leading-none">SDL</span>
      <span className="rounded-full border border-blue-300 px-2 py-0.5 font-medium text-blue-700 text-xs leading-none">
        Docs
      </span>
    </span>
  );
}

export const github = {
  owner: "sdl",
  repo: "sdl-tools",
};

export const nav = [
  {
    label: "Docs",
    href: "/docs",
  },
  {
    label: "Integrations",
    href: "/integrations",
  },
  {
    label: "GitHub",
    href: `https://github.com/${github.owner}/${github.repo}/`,
  },
];

export const suggestions = [
  "How do I start using SDL?",
  "What are Objectives?",
  "How does Branch Memory work?",
  "How do worktree slots help parallel agent work?",
];

export const agent = {
  product: {
    name: "SDL",
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
    "Use /sitemap.md to identify the most relevant SDL documentation pages before answering broad questions.",
    "Fetch focused documentation pages with /llms.mdx/<slug>, or use /llms.txt when the complete published corpus is useful.",
    "When verifying SDL CLI behavior, prefer documented --json or Clinkr-style machine output where available.",
    "Do not assume root docs/ are public product docs; SDL's repo-root docs/ tree is internal engineering documentation.",
  ],
};

export const title = "SDL Documentation";

export const prompt =
  "You are a helpful assistant specializing in SDL, a composable toolkit for plan-oriented agentic engineering. You help users plan implementation work, use isolated worktree slots, and carry context across agent sessions.";

export const translations = {
  en: {
    displayName: "English",
  },
};

export const basePath: string | undefined = undefined;

export const siteId: string | undefined = "sdl-docs";
