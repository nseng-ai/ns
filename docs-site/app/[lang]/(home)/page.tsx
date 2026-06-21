import Link from "next/link";

const features = [
  {
    title: "Lorem ipsum",
    description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  },
  {
    title: "Dolor sit amet",
    description: "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  },
  {
    title: "Consectetur adipiscing",
    description: "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-6xl flex-col px-6 py-20">
      <section className="max-w-3xl space-y-6">
        <p className="font-medium text-blue-700 text-sm tracking-wide">sdl Documentation</p>
        <h1 className="text-balance font-semibold text-5xl text-gray-1000 tracking-tight md:text-6xl">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit.
        </h1>
        <p className="text-balance text-gray-800 text-xl leading-8">
          sdl lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
          labore et dolore magna aliqua.
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
