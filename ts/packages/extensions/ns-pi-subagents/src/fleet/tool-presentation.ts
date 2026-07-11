import type { RunnerSubagentToolInvocation } from "../runner-subagents/timeline.ts";

export type FleetToolPresentation =
	| { kind: "path"; path: string }
	| { kind: "command"; command: string };

type FleetToolPresentationPolicy = FleetToolPresentation["kind"];

const TOOL_PRESENTATION_POLICIES: Readonly<Record<string, FleetToolPresentationPolicy>> = {
	read: "path",
	"functions.read": "path",
	write: "path",
	"functions.write": "path",
	edit: "path",
	"functions.edit": "path",
	bash: "command",
	"functions.bash": "command",
};

export function fleetToolPresentation(input: {
	toolName: string;
	invocation: RunnerSubagentToolInvocation | undefined;
}): FleetToolPresentation | undefined {
	const policy: FleetToolPresentationPolicy | undefined =
		TOOL_PRESENTATION_POLICIES[input.toolName];
	if (policy === undefined || input.invocation === undefined) return undefined;
	switch (policy) {
		case "path": {
			const path = input.invocation.kind === "fields" ? input.invocation.fields.path : undefined;
			return path === undefined ? undefined : { kind: "path", path };
		}
		case "command": {
			const command =
				input.invocation.kind === "text" ? input.invocation.text : input.invocation.fields.command;
			return command === undefined ? undefined : { kind: "command", command };
		}
		default: {
			const exhaustive: never = policy;
			return exhaustive;
		}
	}
}
