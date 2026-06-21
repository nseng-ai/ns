import type { Metadata } from "next";
import Link from "next/link";
import { Card, CtaLink, Eyebrow, PreviewPanel } from "@/components/marketing-ui";
import {
  extensionCatalogEntries,
  extensionCategoryDescriptors,
  extensionStatusLabels,
  featuredExtensionCatalogEntries,
  getExtensionCategoryLabel,
  type ExtensionCatalogEntry,
} from "@/lib/extensions-catalog";

export const metadata: Metadata = {
  title: "Extensions | sdl Documentation",
  description: "A static catalog of sdl's local Pi and workflow extensions.",
};

export default function ExtensionsPage() {
  const featuredEntries = featuredExtensionCatalogEntries();

  return (
    <main className="bg-background-100">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1fr_420px] lg:items-center lg:py-24">
        <div className="space-y-8">
          <Eyebrow>Extensions gallery</Eyebrow>
          <div className="max-w-3xl space-y-5">
            <h1 className="text-balance font-semibold text-5xl text-gray-1000 tracking-[-0.04em] md:text-7xl">
              Local workflows, agent-ready.
            </h1>
            <p className="text-balance text-gray-800 text-xl leading-8">
              sdl extensions wire planning, branch context, PR feedback, and runtime visibility into Pi so
              agent sessions can continue work with the right controls already in reach.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <CtaLink href="#all-extensions">Browse extensions</CtaLink>
            <CtaLink href="/docs/guides/context-across-sessions" variant="secondary">
              Read the guide
            </CtaLink>
          </div>
        </div>

        <PreviewPanel
          badge="static"
          eyebrow="sdl extension catalog"
          title={`${extensionCatalogEntries.length} local surfaces`}
        >
          <div className="mt-5 space-y-3 font-mono text-sm">
            {featuredEntries.slice(0, 4).map((entry) => (
              <div className="rounded-2xl border border-background/15 bg-background/5 p-3" key={entry.slug}>
                <p className="text-background/60 text-xs">{entry.sourcePath}</p>
                <p className="mt-1 text-background">{entry.commandHint}</p>
              </div>
            ))}
          </div>
        </PreviewPanel>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-12">
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Source" value="Repo local" detail="Catalog data lives with the docs-site." />
          <MetricCard label="Shape" value="Static" detail="No registry, downloads, or popularity metadata." />
          <MetricCard label="Tone" value="Vercel clean" detail="Minimal cards, strong hierarchy, quiet borders." />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="font-medium text-blue-700 text-sm">Featured</p>
            <h2 className="mt-2 font-semibold text-3xl text-gray-1000 tracking-tight">Start here</h2>
          </div>
          <p className="max-w-xl text-gray-800 text-sm leading-6">
            These extension surfaces carry the core sdl loop: plan the work, attach context, continue the
            branch, and leave a durable handoff when needed.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {featuredEntries.map((entry) => (
            <ExtensionCard entry={entry} isProminent key={entry.slug} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12" id="all-extensions">
        <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="font-medium text-blue-700 text-sm">All extensions</p>
            <h2 className="mt-2 font-semibold text-3xl text-gray-1000 tracking-tight">Browse by workflow</h2>
          </div>
          <p className="max-w-xl text-gray-800 text-sm leading-6">
            This catalog is intentionally small and local. Add richer copy later when the public docs prose is
            rewritten.
          </p>
        </div>

        <div className="space-y-8">
          {extensionCategoryDescriptors.map((descriptor) => {
            const entries = extensionCatalogEntries.filter((entry) => entry.category === descriptor.category);

            return (
              <section className="rounded-[1.5rem] border bg-background p-4 md:p-5" key={descriptor.category}>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h3 className="font-semibold text-gray-1000 text-xl">{descriptor.label}</h3>
                  <span className="rounded-full border px-2 py-1 text-gray-800 text-xs">
                    {entries.length} {entries.length === 1 ? "extension" : "extensions"}
                  </span>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  {entries.map((entry) => (
                    <ExtensionCard entry={entry} key={entry.slug} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </main>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
}

function MetricCard({ label, value, detail }: MetricCardProps) {
  return (
    <Card>
      <p className="font-medium text-blue-700 text-sm">{label}</p>
      <p className="mt-2 font-semibold text-2xl text-gray-1000 tracking-tight">{value}</p>
      <p className="mt-2 text-gray-800 text-sm leading-6">{detail}</p>
    </Card>
  );
}

interface ExtensionCardProps {
  entry: ExtensionCatalogEntry;
  isProminent?: boolean;
}

function ExtensionCard({ entry, isProminent = false }: ExtensionCardProps) {
  return (
    <article
      className={
        isProminent
          ? "group rounded-[1.5rem] border bg-background p-5 shadow-sm transition-colors hover:border-gray-1000/40"
          : "group rounded-2xl border bg-background-100 p-4 transition-colors hover:border-gray-1000/40"
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border bg-background px-2 py-1 font-medium text-gray-900 text-xs">
          {getExtensionCategoryLabel(entry.category)}
        </span>
        <span className="rounded-full border bg-background px-2 py-1 text-gray-800 text-xs">
          {extensionStatusLabels[entry.status]}
        </span>
      </div>
      <h3 className="mt-4 font-semibold text-gray-1000 text-xl tracking-tight">{entry.name}</h3>
      <p className="mt-2 text-gray-800 text-sm leading-6">{entry.summary}</p>
      <p className="mt-3 text-gray-700 text-sm leading-6">{entry.details}</p>
      <div className="mt-5 rounded-xl border bg-background p-3 font-mono text-gray-900 text-xs">
        <p className="text-gray-700">Use</p>
        <p className="mt-1 truncate text-gray-1000">{entry.commandHint}</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="font-mono text-gray-700">{entry.sourcePath}</span>
        {entry.docsHref ? (
          <Link
            className="font-medium text-blue-700 underline-offset-4 hover:underline"
            href={entry.docsHref}
          >
            Docs
          </Link>
        ) : null}
      </div>
    </article>
  );
}
