// Packaging probe only: a deliberately trivial workflow whose sole purpose is
// to give the `build:deployable` gate a real `"use workflow"` / `"use step"`
// entrypoint to compile through Vercel's workflow builder. It carries no
// dispatch behavior; the first real workflow probe (workflow-hello-probe)
// replaces it as the objective's spine work lands. Live workflow execution is
// pending verification — nothing here has run on Vercel.
"use workflow";

export async function helloPackagingProbe(name: string): Promise<string> {
	const greeting = await formatGreeting(name);
	return greeting;
}

async function formatGreeting(name: string): Promise<string> {
	"use step";
	return `hello, ${name}`;
}
