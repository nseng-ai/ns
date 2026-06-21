import Link from "next/link";

const features = [
  {
    title: "Plan-oriented engineering",
    description: "Turn multi-session engineering work into durable Objectives and enriched plans.",
  },
  {
    title: "Isolated implementation slots",
    description: "Use worktree slots to let humans and agents advance branches without clobbering each other.",
  },
  {
    title: "Context across sessions",
    description: "Carry branch-scoped decisions through Branch Memory, handoffs, and branch context.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-6xl flex-col px-6 py-20">
      <section className="max-w-3xl space-y-6">
        <p className="font-medium text-blue-700 text-sm uppercase tracking-wide">SDL Documentation</p>
        <h1 className="text-balance font-semibold text-5xl text-gray-1000 tracking-tight md:text-6xl">
          Plan, implement, and resume agentic engineering work.
        </h1>
        <p className="text-balance text-gray-800 text-xl leading-8">
          SDL is a composable toolkit for plan-oriented agentic engineering: plans, worktree slots,
          Branch Memory, handoffs, Objectives, and PR feedback workflows.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-full bg-gray-1000 px-5 py-2.5 font-medium text-background text-sm"
            href="/docs/introduction"
          >
            Read the docs
          </Link>
          <Link
            className="rounded-full border px-5 py-2.5 font-medium text-gray-1000 text-sm"
            href="/docs/get-started/quickstart"
          >
            Get started
          </Link>
        </div>
      </section>

      <section className="mt-16 grid gap-4 md:grid-cols-3">
        {features.map((feature) => (
          <article className="rounded-2xl border bg-background p-5" key={feature.title}>
            <h2 className="font-semibold text-lg text-gray-1000">{feature.title}</h2>
            <p className="mt-2 text-gray-800 text-sm leading-6">{feature.description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
