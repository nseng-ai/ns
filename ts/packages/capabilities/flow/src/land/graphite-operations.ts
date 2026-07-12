import { formatCommand, type ExecResult } from "@nseng-ai/foundation/command";
import { stripTerminalEscapes } from "@nseng-ai/foundation/terminal-escapes";

import type { LandingPlan } from "./types.ts";

export const BACKUP_REF_NAMESPACE = "refs/ns/flow-land-backup";
export const BACKUP_REF_PREV_NAMESPACE = "refs/ns/flow-land-backup-prev";
export const LAND_BACKUP_RECOVERY_HINT = `Pre-land branch SHAs are saved under ${BACKUP_REF_NAMESPACE}/<branch>; one previous generation is kept under ${BACKUP_REF_PREV_NAMESPACE}/<branch> (restore with git update-ref refs/heads/<branch> ${BACKUP_REF_NAMESPACE}/<branch>).`;

export interface CheckedOutElsewhere {
	branch: string;
	path: string;
}

export type GetDownstackConflictHandling = "fail" | "defer";
export type DeleteLocalBranchConflictHandling = "fail" | "retain";
export type GraphiteRestackScope = "branch-only" | "upstack";

export type LandGraphiteOperation =
	| { kind: "trunk" }
	| { kind: "submit-update"; branch: string; force?: boolean }
	| { kind: "restack"; branch: string; scope: GraphiteRestackScope }
	| {
			kind: "get-downstack-no-checkout";
			branch: string;
			checkedOutConflictHandling?: GetDownstackConflictHandling;
	  }
	| {
			kind: "delete-local-branch";
			branch: string;
			checkedOutConflictHandling?: DeleteLocalBranchConflictHandling;
	  }
	| { kind: "untrack-local-branch"; branch: string };

interface GraphiteOperationSpec<TOperation extends LandGraphiteOperation> {
	kind: TOperation["kind"];
	buildArgs(operation: TOperation): string[];
}

type GraphiteOperationSpecs = {
	[K in LandGraphiteOperation["kind"]]: GraphiteOperationSpec<
		Extract<LandGraphiteOperation, { kind: K }>
	>;
};

export function trunkOperation(): Extract<LandGraphiteOperation, { kind: "trunk" }> {
	return { kind: "trunk" };
}

export function submitUpdateOperation(input: {
	readonly branch: string;
	readonly force?: boolean;
}): Extract<LandGraphiteOperation, { kind: "submit-update" }> {
	return {
		kind: "submit-update",
		branch: input.branch,
		...(input.force === undefined ? {} : { force: input.force }),
	};
}

export function restackOperation(input: {
	readonly branch: string;
	readonly scope: GraphiteRestackScope;
}): Extract<LandGraphiteOperation, { kind: "restack" }> {
	return { kind: "restack", branch: input.branch, scope: input.scope };
}

export function getDownstackNoCheckoutOperation(input: {
	readonly branch: string;
	readonly checkedOutConflictHandling?: GetDownstackConflictHandling;
}): Extract<LandGraphiteOperation, { kind: "get-downstack-no-checkout" }> {
	return {
		kind: "get-downstack-no-checkout",
		branch: input.branch,
		...(input.checkedOutConflictHandling === undefined
			? {}
			: { checkedOutConflictHandling: input.checkedOutConflictHandling }),
	};
}

export function deleteLocalBranchOperation(input: {
	readonly branch: string;
	readonly checkedOutConflictHandling?: DeleteLocalBranchConflictHandling;
}): Extract<LandGraphiteOperation, { kind: "delete-local-branch" }> {
	return {
		kind: "delete-local-branch",
		branch: input.branch,
		...(input.checkedOutConflictHandling === undefined
			? {}
			: { checkedOutConflictHandling: input.checkedOutConflictHandling }),
	};
}

export function untrackLocalBranchOperation(
	branch: string,
): Extract<LandGraphiteOperation, { kind: "untrack-local-branch" }> {
	return { kind: "untrack-local-branch", branch };
}

export function restackTargetForSubmit(plan: LandingPlan): string | undefined {
	return plan.submitRestackRequirements[0]?.branch;
}

export function formatSubmitUpdateCommandLines(plan: LandingPlan): string[] {
	const submitOperation = submitUpdateOperation({ branch: plan.stack.landingTargetBranch });
	const restackTarget = restackTargetForSubmit(plan);
	return restackTarget
		? [
				formatGraphiteOperation(restackOperation({ branch: restackTarget, scope: "upstack" })),
				formatGraphiteOperation(submitOperation),
			]
		: [formatGraphiteOperation(submitOperation)];
}

export function formatGraphiteOperation(operation: LandGraphiteOperation): string {
	return formatCommand("gt", buildGraphiteOperationArgs(operation));
}

export function parseGitCheckedOutElsewhere(result: ExecResult): CheckedOutElsewhere | undefined {
	const output = stripAnsi(`${result.stderr}\n${result.stdout}`);
	const match = output.match(
		/fatal:\s*['"]([^'"]+)['"] is already checked out at ['"]([^'"]+)['"]/i,
	);
	if (!match) return undefined;
	const branch = match[1];
	const path = match[2];
	if (!branch || !path) return undefined;
	return { branch, path };
}

export function stripAnsi(text: string): string {
	return stripTerminalEscapes(text);
}

function graphiteRestackFlag(scope: GraphiteRestackScope): "--only" | "--upstack" {
	return scope === "branch-only" ? "--only" : "--upstack";
}

const GRAPHITE_OPERATION_SPECS = {
	trunk: {
		kind: "trunk",
		buildArgs: (_operation) => ["trunk", "--no-interactive"],
	},
	"submit-update": {
		kind: "submit-update",
		buildArgs: (operation) => [
			"submit",
			"--branch",
			operation.branch,
			"--no-stack",
			"--update-only",
			"--no-edit",
			"--no-ai",
			"--no-interactive",
			...(operation.force ? ["--force"] : []),
		],
	},
	restack: {
		kind: "restack",
		buildArgs: (operation) => [
			"restack",
			"--branch",
			operation.branch,
			graphiteRestackFlag(operation.scope),
			"--no-interactive",
		],
	},
	"get-downstack-no-checkout": {
		kind: "get-downstack-no-checkout",
		buildArgs: (operation) => [
			"get",
			operation.branch,
			"--downstack",
			"--no-restack",
			"--no-checkout",
			"--force",
			"--no-interactive",
		],
	},
	"delete-local-branch": {
		kind: "delete-local-branch",
		buildArgs: (operation) => ["delete", operation.branch, "-f", "-q"],
	},
	"untrack-local-branch": {
		kind: "untrack-local-branch",
		buildArgs: (operation) => ["untrack", operation.branch],
	},
} satisfies GraphiteOperationSpecs;

export function buildGraphiteOperationArgs(operation: LandGraphiteOperation): string[] {
	switch (operation.kind) {
		case "trunk":
			return GRAPHITE_OPERATION_SPECS.trunk.buildArgs(operation);
		case "submit-update":
			return GRAPHITE_OPERATION_SPECS["submit-update"].buildArgs(operation);
		case "restack":
			return GRAPHITE_OPERATION_SPECS.restack.buildArgs(operation);
		case "get-downstack-no-checkout":
			return GRAPHITE_OPERATION_SPECS["get-downstack-no-checkout"].buildArgs(operation);
		case "delete-local-branch":
			return GRAPHITE_OPERATION_SPECS["delete-local-branch"].buildArgs(operation);
		case "untrack-local-branch":
			return GRAPHITE_OPERATION_SPECS["untrack-local-branch"].buildArgs(operation);
	}
}
