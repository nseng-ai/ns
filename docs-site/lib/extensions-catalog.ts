export type ExtensionCategory =
  | "planning-context"
  | "branch-pr"
  | "review-quality"
  | "interaction"
  | "runtime-visibility";

export interface ExtensionCatalogEntry {
  slug: string;
  name: string;
  summary: string;
  details: string;
  category: ExtensionCategory;
  status: "built-in" | "workflow" | "experimental";
  commandHint: string;
  sourcePath: string;
  docsHref?: string;
  isFeatured?: boolean;
}

export const extensionCategoryLabels = {
  "planning-context": "Planning & context",
  "branch-pr": "Branch & PR workflow",
  "review-quality": "Review & quality",
  interaction: "Interaction",
  "runtime-visibility": "Runtime visibility",
} satisfies Record<ExtensionCategory, string>;

// This catalog is curated display metadata. Do not derive it from pi-extensions parity records:
// parity records track CLI/skill equivalence, while these entries optimize docs discovery copy.
export const extensionCatalogEntries: readonly ExtensionCatalogEntry[] = [
  {
    slug: "sdl-command-mirrors",
    name: "SDL command mirrors",
    summary: "Run checkpoint, changes, submit, and PR regeneration workflows from Pi slash commands.",
    details:
      "Thin Pi adapters expose SDL's lifecycle commands without making agents leave the current session.",
    category: "branch-pr",
    status: "built-in",
    commandHint: "/sdl:code:checkpoint",
    sourcePath: ".pi/extensions/sdl.ts",
    docsHref: "/docs/concepts/cli-conventions",
    isFeatured: true,
  },
  {
    slug: "branch-context",
    name: "Branch context",
    summary: "Attach a saved implementation plan to a branch and resume it in a fresh agent session.",
    details:
      "Connects enriched plans, branch-scoped metadata, and implementation prompts for plan-first work.",
    category: "planning-context",
    status: "workflow",
    commandHint: "/sdl:branch-context:impl-attached-plan",
    sourcePath: ".pi/extensions/branch-context.ts",
    isFeatured: true,
  },
  {
    slug: "objectives",
    name: "Objectives",
    summary: "Create, update, choose, and implement durable roadmap records from the agent runtime.",
    details:
      "Keeps long-running work grounded in checked-in Objective records instead of hidden session memory.",
    category: "planning-context",
    status: "workflow",
    commandHint: "/objective:next",
    sourcePath: ".pi/extensions/objective.ts",
    docsHref: "/docs/concepts/objectives",
    isFeatured: true,
  },
  {
    slug: "handoffs",
    name: "Handoffs",
    summary: "Create, list, and pick up directed continuation artifacts for future sessions.",
    details:
      "Stores durable handoff artifacts in Branch Memory and presents clean pickup prompts to agents.",
    category: "planning-context",
    status: "workflow",
    commandHint: "/handoff:pickup",
    sourcePath: ".pi/extensions/handoff.ts",
    docsHref: "/docs/guides/context-across-sessions",
    isFeatured: true,
  },
  {
    slug: "ccc-workspaces",
    name: "CCC workspace controls",
    summary: "Coordinate cmux workspaces, Graphite branches, and focused continuation tabs.",
    details:
      "Repo-local command-and-control glue for multi-branch agent work where workspace state matters.",
    category: "branch-pr",
    status: "built-in",
    commandHint: "/ccc:stack-map",
    sourcePath: ".pi/extensions/ccc.ts",
  },
  {
    slug: "pr-feedback",
    name: "PR feedback tools",
    summary: "Download, preview, classify, and address GitHub PR review feedback inside Pi.",
    details:
      "Surfaces review threads and feedback context so follow-up work can stay tied to the active branch.",
    category: "review-quality",
    status: "workflow",
    commandHint: "/pr:preview-feedback",
    sourcePath: ".pi/extensions/pr.ts",
    docsHref: "/docs/guides/addressing-pr-feedback",
  },
  {
    slug: "grill-ui",
    name: "Grill UI",
    summary: "Ask structured, one-question-at-a-time design interview questions with selectable answers.",
    details:
      "A model-visible tool and inline UI that keeps planning interviews explicit, resumable, and bounded.",
    category: "interaction",
    status: "built-in",
    commandHint: "/pi:grill-me",
    sourcePath: ".pi/extensions/grill-ui.ts",
  },
  {
    slug: "runner-subagents",
    name: "Runner subagents",
    summary: "Delegate focused investigation or implementation slices to separate Pi sessions.",
    details:
      "Packages curated context and terminal tool access for bounded subagent work from a parent session.",
    category: "interaction",
    status: "experimental",
    commandHint: "dispatch_runner_subagent",
    sourcePath: ".pi/extensions/dispatch-runner-subagent.ts",
  },
  {
    slug: "worktree-status",
    name: "Worktree status footer",
    summary: "Keep branch, PR, Graphite, Branch Memory, and dirty-worktree state visible in-session.",
    details:
      "A passive runtime surface that makes the current checkout's coordination facts hard to miss.",
    category: "runtime-visibility",
    status: "built-in",
    commandHint: "automatic footer",
    sourcePath: ".pi/extensions/worktree-status.ts",
  },
];

export function featuredExtensionCatalogEntries() {
  return extensionCatalogEntries.filter((entry): entry is ExtensionCatalogEntry => entry.isFeatured === true);
}
