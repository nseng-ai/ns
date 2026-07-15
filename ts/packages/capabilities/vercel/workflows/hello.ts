// Probe-1 (workflow-hello-probe): the deliberately trivial hello workflow
// behind the authenticated trigger route. It exists to prove the packaging →
// trigger → observe spine end to end — `"use workflow"`/`"use step"`
// compilation through Vercel's workflow builder and Queues wiring, `start()`
// from the trigger route, and `getRun` observation — not to do useful work.
// Live workflow execution is pending verification: nothing here has run on
// Vercel yet.

export async function helloWorkflow(name: string): Promise<string> {
	"use workflow";
	const greeting = await formatGreeting(name);
	return greeting;
}

async function formatGreeting(name: string): Promise<string> {
	"use step";
	return `hello, ${name}`;
}
