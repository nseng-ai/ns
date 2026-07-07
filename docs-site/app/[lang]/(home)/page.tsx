import type { Metadata } from "next";
import Link from "next/link";
import { Card, CtaLink, MarketingHero, PreviewPanel } from "@/components/marketing-ui";
import { organizationName, productName } from "@/lib/geistdocs/site-identity";

const pageTitle = `${productName} — the kernel for ${organizationName}`;
const pageDescription = `${productName} gives agent-driven work boundaries that live in git: durable intent, scoped memory, isolated worktrees, and a gate where output becomes real.`;

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  openGraph: {
    title: pageTitle,
    description: pageDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
  },
};

const features = [
  {
    title: "Durable intent",
    description: "Objectives, branch context, and handoffs: planning state that outlives any single session.",
  },
  {
    title: "Isolated places",
    description: "Worktree slots give every branch its own workspace — parallel agent work without collisions.",
  },
  {
    title: "Extension ecosystem",
    description: "Retrospectives, code reviews, and PR-feedback triage — built on the ns kernel.",
    href: "/extensions",
  },
];

const treeItems = [
  { depth: 0, label: "docs-site/", tone: "folder" },
  { depth: 1, label: "docs/", tone: "folder" },
  { depth: 2, label: "get-started/quickstart.mdx", tone: "page" },
  { depth: 2, label: "concepts/objectives.mdx", tone: "page" },
  { depth: 2, label: "guides/parallel-branches.mdx", tone: "page" },
  { depth: 1, label: "app/[lang]/", tone: "folder" },
  { depth: 2, label: "llms.txt", tone: "route" },
  { depth: 2, label: "agents.md", tone: "route" },
] as const;

const installCommands = ["just docs-dev", "just docs-check", "pnpm --dir docs-site run build"] as const;

export default function HomePage() {
  return (
    <main className="bg-background-100">
      <MarketingHero
        ctas={
          <>
            <CtaLink href="/docs/introduction">Read the docs</CtaLink>
            <CtaLink href="/docs/get-started/quickstart" variant="secondary">
              Get started
            </CtaLink>
            <CtaLink href="/extensions" variant="secondary">
              Browse extensions
            </CtaLink>
          </>
        }
        description={`${pageDescription} A kernel you embed — not a harness you adopt.`}
        eyebrow="ns · nonslop engineering"
        eyebrowTone="blue"
        sidePanel={<FileTreePreview />}
        title="The kernel for nonslop engineering."
      />

      <section className="mx-auto max-w-6xl px-6 pb-12">
        <div className="grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title}>
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
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-12 lg:grid-cols-[1fr_420px] lg:items-start">
        <div className="space-y-4">
          <p className="font-medium text-blue-700 text-sm">Bring your own harness</p>
          <h2 className="font-semibold text-3xl text-gray-1000 tracking-tight md:text-4xl">
            Bound the work — in git.
          </h2>
          <p className="max-w-2xl text-gray-800 text-sm leading-6">
            Intent, memory, and history live in git, so any session in any harness picks up exactly
            where the last one left off.
          </p>
        </div>
        <InstallerPreview />
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12 pb-20">
        <div className="rounded-[2rem] border bg-gray-1000 p-6 text-background-100 md:p-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div className="max-w-2xl space-y-3">
              <p className="font-medium text-background-100/60 text-sm">nonslop engineering</p>
              <h2 className="font-semibold text-3xl tracking-tight md:text-4xl">
                Engineers are not factory managers; they are sorcerers.
              </h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <CtaLink href="/docs/introduction" variant="dark-primary">
                Start reading
              </CtaLink>
              <CtaLink href="/extensions" variant="dark-secondary">
                View extensions
              </CtaLink>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function FileTreePreview() {
  return (
    <PreviewPanel badge="static" eyebrow="published docs tree" title="docs-site routes">
      <div className="mt-5 space-y-2 font-mono text-sm">
        {treeItems.map((item) => (
          <div
            className="flex items-center gap-2 rounded-xl border border-background-100/10 bg-background-100/5 px-3 py-2"
            key={`${item.depth}-${item.label}`}
          >
            <span className="text-background-100/25">{"  ".repeat(item.depth)}</span>
            <span className={item.tone === "folder" ? "text-blue-200" : "text-background-100/80"}>
              {item.label}
            </span>
            {item.tone === "route" ? (
              <span className="ml-auto rounded-full border border-background-100/15 px-2 py-0.5 text-background-100/50 text-[0.625rem] uppercase tracking-[0.14em]">
                route
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </PreviewPanel>
  );
}

function InstallerPreview() {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border bg-gray-1000 text-background-100 shadow-sm">
      <div className="flex items-center gap-2 border-background-100/15 border-b px-4 py-3">
        <span className="size-2 rounded-full bg-red-400" />
        <span className="size-2 rounded-full bg-yellow-400" />
        <span className="size-2 rounded-full bg-green-400" />
        <span className="ml-2 font-mono text-background-100/50 text-xs">terminal</span>
      </div>
      <div className="space-y-3 p-5 font-mono text-sm">
        {installCommands.map((command) => (
          <div className="flex items-start gap-3" key={command}>
            <span className="text-blue-200">$</span>
            <code className="text-background-100/90">{command}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
