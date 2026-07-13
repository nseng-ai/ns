// Probe-1 (workflow-hello-probe): the deliberately trivial hello workflow
// behind the authenticated trigger route. It exists to prove the packaging →
// trigger → observe spine end to end — `"use workflow"`/`"use step"`
// compilation through Vercel's workflow builder and Queues wiring, `start()`
// from the trigger route, and `getRun` observation — not to do useful work.
// Live workflow execution is pending verification: nothing here has run on
// Vercel yet.

/**
 * The manifest identity `start()` must reference for {@link helloWorkflow}.
 *
 * The trigger route's function bundle is emitted by Vercel's Node builder
 * without the Workflow SDK transform, so a directly imported workflow
 * function carries no transform-injected `workflowId`; callers pass this
 * metadata id explicitly instead. The id is derived from this file's path and
 * export name (`workflow//./workflows/<file>//<export>`), and the
 * `build:deployable` gate fails when the emitted workflow manifest does not
 * contain it.
 */
export const helloWorkflowId = "workflow//./workflows/hello//helloWorkflow";

export async function helloWorkflow(name: string): Promise<string> {
	"use workflow";
	const greeting = await formatGreeting(name);
	return greeting;
}

async function formatGreeting(name: string): Promise<string> {
	"use step";
	return `hello, ${name}`;
}
