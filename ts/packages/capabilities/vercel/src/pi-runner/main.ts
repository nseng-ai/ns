// The pi runner's process entry — what the dispatch workflow's launch step
// starts detached inside the sandbox (the pi recipe in
// `../dispatch/harness-invocation.ts` names this module by path as the
// launch command). The sandbox runs it with the checkout as working
// directory; model keys arrive through the detached command's own
// environment, injected by name by the launch step. Exit codes are the
// runner's honest status for the sandbox logs (0 completed, 1 failed, 2 no
// result written); the workflow itself reads the outcome from the contract
// result file, never from this process.
import { createRealDispatchWorkspaceGateway } from "./real-dispatch-workspace-gateway.ts";
import { createRealPiCodingAgentGateway } from "./real-pi-coding-agent-gateway.ts";
import { PI_RUNNER_EXIT_RESULT_UNWRITTEN, runDispatchedPiAgent } from "./runner.ts";

async function main(): Promise<number> {
	const checkoutDirectory = process.cwd();
	const report = await runDispatchedPiAgent({
		workspace: createRealDispatchWorkspaceGateway({ checkoutDirectory }),
		agent: createRealPiCodingAgentGateway({ cwd: checkoutDirectory }),
	});
	console.log(
		`ns pi runner: outcome=${report.outcome} resultWritten=${report.hasWrittenCompletionResult} — ${report.detail}`,
	);
	return report.exitCode;
}

if (import.meta.main) {
	try {
		// Explicit exit: the pi library may keep handles (timers, streams)
		// alive after disposal, and a detached runner that never exits would
		// look identical to a hung run in the sandbox logs.
		process.exit(await main());
	} catch (error) {
		console.error(
			`ns pi runner crashed before writing a result: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		process.exit(PI_RUNNER_EXIT_RESULT_UNWRITTEN);
	}
}
