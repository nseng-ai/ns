import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "sdl Documentation",
  description: "Published documentation for sdl's plan-oriented agentic engineering workflows.",
  openGraph: {
    title: "sdl Documentation",
    description: "Published documentation for sdl's plan-oriented agentic engineering workflows.",
  },
  twitter: {
    card: "summary_large_image",
    title: "sdl Documentation",
    description: "Published documentation for sdl's plan-oriented agentic engineering workflows.",
  },
};

const features = [
  {
    title: "Durable plans",
    description: "Track Objectives, branch context, and handoffs as checked-in or branch-scoped context.",
  },
  {
    title: "Parallel branches",
    description: "Coordinate worktree slots, Graphite stacks, and PR feedback without losing session state.",
  },
  {
    title: "Agent extensions",
    description: "Browse the local extension surfaces that bring sdl workflows into Pi.",
    href: "/extensions",
  },
];

const treeItems = [
  { depth: 0, label: "docs-site/", tone: "folder" },
  { depth: 1, label: "docs/", tone: "folder" },
  { depth: 2, label: "get-started/quickstart.mdx", tone: "page" },
  { depth: 2, label: "concepts/objectives.mdx", tone: "page" },
  { depth: 2, label: "tools/brmem.mdx", tone: "page" },
  { depth: 1, label: "app/[lang]/", tone: "folder" },
  { depth: 2, label: "llms.txt", tone: "route" },
  { depth: 2, label: "agents.md", tone: "route" },
] as const;

const installCommands = ["just docs-dev", "just docs-check", "pnpm --dir docs-site run build"] as const;

export default function HomePage() {
  return (
    <main className="bg-background-100">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1fr_440px] lg:items-center lg:py-24">
        <div className="space-y-8">
          <div className="inline-flex rounded-full border bg-background px-3 py-1 font-medium text-blue-700 text-xs uppercase tracking-[0.18em]">
            sdl Documentation
          </div>
          <div className="max-w-3xl space-y-5">
            <h1 className="text-balance font-semibold text-5xl text-gray-1000 tracking-[-0.04em] md:text-7xl">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            </h1>
            <p className="text-balance text-gray-800 text-xl leading-8">
              sdl lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt
              ut labore et dolore magna aliqua.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-gray-1000 px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90"
              href="/docs/introduction"
            >
              Read the docs
            </Link>
            <Link
              className="rounded-full border bg-background px-5 py-2.5 font-medium text-gray-1000 text-sm transition-colors hover:bg-background-100"
              href="/docs/get-started/quickstart"
            >
              Get started
            </Link>
            <Link
              className="rounded-full border bg-background px-5 py-2.5 font-medium text-gray-1000 text-sm transition-colors hover:bg-background-100"
              href="/extensions"
            >
              Browse extensions
            </Link>
          </div>
        </div>

        <FileTreePreview />
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-12">
        <div className="grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <article className="rounded-2xl border bg-background p-5" key={feature.title}>
              <h2 className="font-semibold text-lg text-gray-1000">{feature.title}</h2>
              <p className="mt-2 text-gray-800 text-sm leading-6">{feature.description}</p>
              {feature.href ? (
                <Link
                  className="mt-4 inline-flex font-medium text-blue-700 text-sm underline-offset-4 hover:underline"
                  href={feature.href}
                >
                  Explore gallery
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-12 lg:grid-cols-[1fr_420px] lg:items-start">
        <div className="space-y-4">
          <p className="font-medium text-blue-700 text-sm">Local workflow</p>
          <h2 className="font-semibold text-3xl text-gray-1000 tracking-tight md:text-4xl">
            Build, check, and preview from the repo root.
          </h2>
          <p className="max-w-2xl text-gray-800 text-sm leading-6">
            The home page keeps the operational surface visible while final launch copy remains deferred.
          </p>
        </div>
        <InstallerPreview />
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12 pb-20">
        <div className="rounded-[2rem] border bg-gray-1000 p-6 text-background md:p-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div className="max-w-2xl space-y-3">
              <p className="font-medium text-background/60 text-sm">Ready when the copy is ready</p>
              <h2 className="font-semibold text-3xl tracking-tight md:text-4xl">
                Keep the structure launch-shaped without locking final positioning.
              </h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className="rounded-full bg-background px-5 py-2.5 font-medium text-gray-1000 text-sm transition-opacity hover:opacity-90"
                href="/docs/introduction"
              >
                Start reading
              </Link>
              <Link
                className="rounded-full border border-background/30 px-5 py-2.5 font-medium text-background text-sm transition-colors hover:bg-background/10"
                href="/extensions"
              >
                View extensions
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function FileTreePreview() {
  return (
    <aside className="rounded-[2rem] border bg-background p-3 shadow-sm">
      <div className="rounded-[1.5rem] border bg-gray-1000 p-5 text-background">
        <div className="flex items-center justify-between border-background/15 border-b pb-4">
          <div>
            <p className="font-mono text-background/60 text-xs">published docs tree</p>
            <p className="mt-1 font-semibold text-xl">docs-site routes</p>
          </div>
          <span className="rounded-full border border-background/20 px-2 py-1 font-mono text-background/70 text-xs">
            static
          </span>
        </div>
        <div className="mt-5 space-y-2 font-mono text-sm">
          {treeItems.map((item) => (
            <div
              className="flex items-center gap-2 rounded-xl border border-background/10 bg-background/5 px-3 py-2"
              key={`${item.depth}-${item.label}`}
            >
              <span className="text-background/25">{"  ".repeat(item.depth)}</span>
              <span className={item.tone === "folder" ? "text-blue-200" : "text-background/80"}>
                {item.label}
              </span>
              {item.tone === "route" ? (
                <span className="ml-auto rounded-full border border-background/15 px-2 py-0.5 text-background/50 text-[0.625rem] uppercase tracking-[0.14em]">
                  route
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function InstallerPreview() {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border bg-gray-1000 text-background shadow-sm">
      <div className="flex items-center gap-2 border-background/15 border-b px-4 py-3">
        <span className="size-2 rounded-full bg-red-400" />
        <span className="size-2 rounded-full bg-yellow-400" />
        <span className="size-2 rounded-full bg-green-400" />
        <span className="ml-2 font-mono text-background/50 text-xs">terminal</span>
      </div>
      <div className="space-y-3 p-5 font-mono text-sm">
        {installCommands.map((command) => (
          <div className="flex items-start gap-3" key={command}>
            <span className="text-blue-200">$</span>
            <code className="text-background/90">{command}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
