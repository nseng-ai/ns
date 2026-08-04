import { join } from "node:path";

import { commandSucceeded, formatCommand } from "@nseng-ai/foundation/command";
import {
	GRAPHITE_METADATA_DB_NAME,
	detectGraphiteForkViolations,
	graphiteBranchMetadataRowsSchema,
	parseGraphiteBranchMetadataRows,
	type GraphiteBranchMetadataRows,
	walkGraphiteAncestors,
	walkGraphiteSubtree,
	type GraphiteForkViolation,
	type GraphiteTopology,
} from "@nseng-ai/extension-kit/graphite/metadata";
import { exec, formatCommandDetails } from "./command-exec.ts";
import { GIT_TIMEOUT_MS, SQLITE_TIMEOUT_MS } from "./constants.ts";
import { readGraphiteBranchMetadataCommand } from "./graphite-command-channel.ts";
import {
	landFailure,
	landingExecutionFailure,
	landSuccess,
	type LandingFailure,
	type LandResult,
} from "../results.ts";
import type { LandExecutionApi } from "./types.ts";
import { z } from "zod";

export type { GraphiteTopology } from "@nseng-ai/extension-kit/graphite/metadata";

export type ForkViolation = GraphiteForkViolation & { readonly expectedChild: string };

export async function resolveMetadataDbPath(
	pi: LandExecutionApi,
	repoRoot: string,
): Promise<LandResult<string>> {
	const args = ["rev-parse", "--path-format=absolute", "--git-common-dir"];
	const result = await exec({ pi, command: "git", args, cwd: repoRoot, timeoutMs: GIT_TIMEOUT_MS });
	if (!commandSucceeded(result)) {
		return landFailure(
			landingExecutionFailure(
				`Could not resolve the git common directory for Graphite metadata.\n${formatCommandDetails(result, formatCommand("git", args))}`,
			),
		);
	}
	const commonDir = result.stdout.trim();
	if (!commonDir) {
		return landFailure(landingExecutionFailure("git rev-parse --git-common-dir returned no path."));
	}
	return landSuccess(join(commonDir, GRAPHITE_METADATA_DB_NAME));
}

export async function loadGraphiteTopology(
	pi: LandExecutionApi,
	repoRoot: string,
	dbPath: string,
): Promise<LandResult<GraphiteTopology>> {
	const metadataCommand = readGraphiteBranchMetadataCommand(dbPath);
	const result = await exec({
		pi,
		command: metadataCommand.command,
		args: metadataCommand.args,
		cwd: repoRoot,
		timeoutMs: SQLITE_TIMEOUT_MS,
	});
	if (!commandSucceeded(result)) {
		return landFailure(
			landingExecutionFailure(
				classifyTopologyReadFailure(result.stderr, failureEnvelopeMessage(result.stdout), dbPath),
				{
					displayCommand: metadataCommand.display,
					execResult: result,
				},
			),
		);
	}

	const decoded = decodeGraphiteMetadataEnvelope(result.stdout);
	if (decoded.type === "invalid") {
		return landFailure(
			landingExecutionFailure(
				`ns flow exec returned ${decoded.reason} for the Graphite metadata DB at ${dbPath}; refusing to land.`,
				{
					displayCommand: metadataCommand.display,
					execResult: result,
				},
			),
		);
	}
	const parsed = parseGraphiteBranchMetadataRows(decoded.rows);
	if (parsed.type === "not_array") {
		throw new Error("Validated Graphite metadata row arrays must remain parseable as arrays.");
	}
	if (parsed.diagnostics.emptyBranchNameRows > 0) {
		return landFailure(
			landingExecutionFailure(
				`Graphite metadata DB at ${dbPath} returned a row without a branch_name; refusing to land.`,
			),
		);
	}
	const firstCorruption = parsed.diagnostics.childrenCorruptions[0];
	if (firstCorruption !== undefined)
		return landFailure(unparsableChildrenFailure(firstCorruption.branch, dbPath));
	return landSuccess(parsed.topology);
}

const graphiteMetadataSuccessEnvelopeSchema = z.strictObject({
	status: z.literal("success"),
	exitCode: z.literal(0),
	data: graphiteBranchMetadataRowsSchema,
});

const clinkrFailureEnvelopeSchema = z.union([
	z.strictObject({
		status: z.literal("negative"),
		exitCode: z.literal(1),
		message: z.string(),
		data: z.unknown().optional(),
	}),
	z.strictObject({
		status: z.enum(["failure", "usage-error"]),
		exitCode: z.literal(2),
		errorType: z.string(),
		message: z.string(),
		data: z.unknown().optional(),
	}),
]);

function decodeGraphiteMetadataEnvelope(
	stdout: string,
):
	| { readonly type: "valid"; readonly rows: GraphiteBranchMetadataRows }
	| { readonly type: "invalid"; readonly reason: string } {
	let raw: unknown;
	try {
		raw = JSON.parse(stdout);
	} catch {
		return { type: "invalid", reason: "unparsable JSON" };
	}
	const decoded = graphiteMetadataSuccessEnvelopeSchema.safeParse(raw);
	if (!decoded.success) return { type: "invalid", reason: "a malformed success envelope" };
	return { type: "valid", rows: decoded.data.data };
}

function failureEnvelopeMessage(stdout: string): string {
	try {
		const decoded = clinkrFailureEnvelopeSchema.safeParse(JSON.parse(stdout));
		return decoded.success ? decoded.data.message : "";
	} catch {
		// Non-JSON stdout is not a Clinkr failure envelope; stderr still carries subprocess evidence.
		return "";
	}
}

function classifyTopologyReadFailure(
	stderr: string,
	envelopeMessage: string,
	dbPath: string,
): string {
	if (
		/no such table|no such column/i.test(stderr) ||
		/no such table|no such column/i.test(envelopeMessage)
	) {
		return `Graphite metadata DB at ${dbPath} does not have the expected branch_metadata schema; refusing to land. This Graphite version may be unsupported.`;
	}
	if (/unable to open database/i.test(stderr) || /unable to open database/i.test(envelopeMessage)) {
		return `Graphite metadata DB at ${dbPath} is missing or unreadable; refusing to land. Run a Graphite command (e.g. gt ls) to initialize it.`;
	}
	return `sqlite3 could not read the Graphite metadata DB at ${dbPath}; refusing to land. Ensure sqlite3 is installed and on PATH (e.g. brew install sqlite).`;
}

// Graphite stores children as a JSON array string. A non-null value that fails to
// parse must fail closed: silently reading it as "no children" would mute the fork gate.
function unparsableChildrenFailure(branch: string, dbPath: string): LandingFailure {
	return landingExecutionFailure(
		`Graphite metadata children for ${branch} could not be parsed (${dbPath}); refusing to continue without an authoritative child list.`,
	);
}

export interface DerivePathToTrunkOptions {
	topology: GraphiteTopology;
	current: string;
	trunk: string;
	dbPath: string;
}

export function derivePathToTrunk(options: DerivePathToTrunkOptions): LandResult<string[]> {
	const { topology, current, trunk, dbPath } = options;
	if (current === trunk) return landSuccess([]);
	if (!topology.has(current)) {
		return landFailure(
			landingExecutionFailure(
				`Current branch ${current} is not tracked in Graphite metadata (${dbPath}); run gt track or gt get before landing.`,
			),
		);
	}

	const walked = walkGraphiteAncestors(topology, current);
	const path = [...walked.ancestors, current].filter((branch) => branch !== trunk);
	if (walked.termination.type === "completed" && walked.terminusBranch === trunk)
		return landSuccess(path);
	if (walked.termination.type === "cycle") {
		return landFailure(
			landingExecutionFailure(
				`Graphite metadata parent chain from ${current} contains a cycle at ${walked.termination.branch}; refusing to land.`,
			),
		);
	}
	if (walked.termination.type === "row_missing") {
		return landFailure(
			landingExecutionFailure(
				`Graphite metadata (${dbPath}) has no entry for ${walked.termination.branch} on the path from ${current} to ${trunk}; refusing to land.`,
			),
		);
	}
	return landFailure(
		landingExecutionFailure(
			`Graphite metadata parent chain from ${current} ends at ${walked.terminusBranch} without reaching trunk ${trunk}; refusing to land.`,
			{
				suggestedAction: `Run gt sync or retarget the stack onto ${trunk}, then rerun /ns:flow:land.`,
			},
		),
	);
}

// gt restack --upstack rewrites the whole subtree above the current branch, so
// worktree-conflict detection and the confirmation prompt must cover all of it,
// not just the first-child chain.
export function deriveDescendantSubtree(
	topology: GraphiteTopology,
	current: string,
): LandResult<string[]> {
	const walked = walkGraphiteSubtree(topology, current);
	if (walked.cycleAt) {
		return landFailure(
			landingExecutionFailure(
				`Graphite metadata descendants of ${current} contain a cycle at ${walked.cycleAt}; refusing to land.`,
			),
		);
	}
	return landSuccess(walked.subtree.slice(1));
}

export function detectForkViolations(
	topology: GraphiteTopology,
	landingPath: string[],
): ForkViolation[] {
	// Forks inside the landing path are unsafe because gt restack/delete would
	// rewrite a sibling stack. Forks from the current landing tip are descendant
	// roots, so they are allowed and handled by descendant maintenance.
	return detectGraphiteForkViolations(topology, landingPath).filter(hasExpectedChild);
}

function hasExpectedChild(violation: GraphiteForkViolation): violation is ForkViolation {
	return violation.expectedChild !== undefined;
}

export function formatForkViolations(violations: ForkViolation[], trunk: string): LandingFailure {
	const lines = violations.map((violation) => {
		const siblingText = violation.siblings
			.map((sibling) => `${sibling.branch} (subtree: ${sibling.subtree.join(" -> ")})`)
			.join(", ");
		return `Refusing to land: the stack forks at ${violation.forkPoint}. Landing path expects ${violation.forkPoint} -> ${violation.expectedChild}, but ${violation.forkPoint} also has: ${siblingText}.`;
	});
	return landingExecutionFailure(lines.join("\n"), {
		suggestedAction: `Land or move the sibling stack first (e.g. gt move --onto ${trunk}), then rerun /ns:flow:land.`,
	});
}
