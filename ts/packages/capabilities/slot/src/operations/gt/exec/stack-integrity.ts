import type { StackFork, StackInfo } from "@sdl/graphite/stack";

import {
	renderChildrenCorruption,
	renderTrunkMarkerWarnings,
	renderWalkTerminationWarning,
} from "./metadata-warnings.ts";

export function validateStackIntegrity(
	stack: StackInfo,
	options: { downstack: boolean; forkHint: string },
):
	| { type: "ok"; warnings: readonly string[] }
	| { type: "failure"; errorType: string; message: string } {
	const markerWarnings = renderTrunkMarkerWarnings(stack.trunkMarker);
	if (markerWarnings.length > 0)
		return {
			type: "failure",
			errorType: "stack-metadata-inconsistent",
			message: markerWarnings.join("; "),
		};
	if (stack.current === stack.trunk) return { type: "ok", warnings: [] };
	const ancestorProblem = renderWalkTerminationWarning({
		kind: "ancestor",
		termination: stack.ancestorTermination,
		label: "walk",
	});
	if (options.downstack) {
		if (ancestorProblem !== null)
			return {
				type: "failure",
				errorType: "stack-metadata-inconsistent",
				message: ancestorProblem,
			};
		const warnings = stack.descendantWalk.forks.map(renderStackFork);
		const descendantProblem = renderWalkTerminationWarning({
			kind: "descendant",
			termination: stack.descendantWalk.termination,
			label: "walk",
		});
		if (descendantProblem !== null) warnings.push(descendantProblem);
		return { type: "ok", warnings };
	}
	const fork = stack.descendantWalk.forks[0];
	if (fork !== undefined)
		return {
			type: "failure",
			errorType: "forked-stack",
			message: forkedStackMessage(fork, options.forkHint),
		};
	const messages = stack.descendantWalk.childrenCorruptions.map(renderChildrenCorruption);
	if (ancestorProblem !== null) messages.push(ancestorProblem);
	const descendantProblem = renderWalkTerminationWarning({
		kind: "descendant",
		termination: stack.descendantWalk.termination,
		label: "walk",
	});
	if (descendantProblem !== null) messages.push(descendantProblem);
	if (messages.length > 0)
		return {
			type: "failure",
			errorType: "stack-metadata-inconsistent",
			message: messages.join("; "),
		};
	return { type: "ok", warnings: [] };
}

function forkedStackMessage(fork: StackFork, forkHint: string): string {
	return `Graphite stack forks at '${fork.branch}' with children: ${fork.children.join(", ")}. Check out the intended tip and rerun, or pass \`${forkHint}\`.`;
}

function renderStackFork(fork: StackFork): string {
	return `branch ${fork.branch} has ${fork.children.length} Graphite children; descendants follow the first child only`;
}
