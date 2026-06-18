import { join } from "node:path";

import { formatCommand } from "@asdl/core/exec";
import {
	GRAPHITE_BRANCH_METADATA_QUERY,
	GRAPHITE_METADATA_DB_NAME,
	detectGraphiteForkViolations,
	parseGraphiteBranchMetadataRows,
	walkGraphiteAncestors,
	walkGraphiteSubtree,
	type GraphiteTopology,
	type GraphiteForkViolation,
} from "@asdl/core/graphite-metadata";
import { exec, formatCommandDetails } from "./command-exec.ts";
import { GIT_TIMEOUT_MS, SQLITE_TIMEOUT_MS } from "./constants.ts";
import { failure, landStackFailure, success, type LandStackFailure, type LandStackResult } from "./errors.ts";
import type { LandStackExtensionAPI } from "./types.ts";

export type { GraphiteTopology } from "@asdl/core/graphite-metadata";

export type ForkViolation = GraphiteForkViolation;

export async function resolveMetadataDbPath(pi: LandStackExtensionAPI, repoRoot: string): Promise<LandStackResult<string>> {
	const args = ["rev-parse", "--path-format=absolute", "--git-common-dir"];
	const result = await exec(pi, "git", args, repoRoot, GIT_TIMEOUT_MS);
	if (result.code !== 0) {
		return failure(
			landStackFailure(
				`Could not resolve the git common directory for Graphite metadata.\n${formatCommandDetails(result, formatCommand("git", args))}`,
			),
		);
	}
	const commonDir = result.stdout.trim();
	if (!commonDir) {
		return failure(landStackFailure("git rev-parse --git-common-dir returned no path."));
	}
	return success(join(commonDir, GRAPHITE_METADATA_DB_NAME));
}

export async function loadGraphiteTopology(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	dbPath: string,
): Promise<LandStackResult<GraphiteTopology>> {
	const args = ["-readonly", "-json", dbPath, GRAPHITE_BRANCH_METADATA_QUERY];
	const result = await exec(pi, "sqlite3", args, repoRoot, SQLITE_TIMEOUT_MS);
	if (result.code !== 0) {
		return failure(
			landStackFailure(classifyTopologyReadFailure(result.stderr, dbPath), {
				commandDisplay: formatCommand("sqlite3", args),
				result,
			}),
		);
	}

	let raw: unknown;
	try {
		raw = JSON.parse(result.stdout.trim() || "[]");
	} catch {
		return failure(
			landStackFailure(`sqlite3 returned unparsable JSON for the Graphite metadata DB at ${dbPath}; refusing to land.`, {
				commandDisplay: formatCommand("sqlite3", args),
				result,
			}),
		);
	}
	const parsed = parseGraphiteBranchMetadataRows(raw);
	if (parsed.type === "not_array") {
		return failure(
			landStackFailure(`sqlite3 returned non-array JSON for the Graphite metadata DB at ${dbPath}; refusing to land.`, {
				commandDisplay: formatCommand("sqlite3", args),
				result,
			}),
		);
	}
	if (parsed.diagnostics.emptyBranchNameRows > 0) {
		return failure(landStackFailure(`Graphite metadata DB at ${dbPath} returned a row without a branch_name; refusing to land.`));
	}
	const firstCorruption = parsed.diagnostics.childrenCorruptions[0];
	if (firstCorruption !== undefined) return failure(unparsableChildrenFailure(firstCorruption.branch, dbPath));
	return success(parsed.topology);
}

function classifyTopologyReadFailure(stderr: string, dbPath: string): string {
	if (/no such table|no such column/i.test(stderr)) {
		return `Graphite metadata DB at ${dbPath} does not have the expected branch_metadata schema; refusing to land. This Graphite version may be unsupported.`;
	}
	if (/unable to open database/i.test(stderr)) {
		return `Graphite metadata DB at ${dbPath} is missing or unreadable; refusing to land. Run a Graphite command (e.g. gt ls) to initialize it.`;
	}
	return `sqlite3 could not read the Graphite metadata DB at ${dbPath}; refusing to land. Ensure sqlite3 is installed and on PATH (e.g. brew install sqlite).`;
}

// Graphite stores children as a JSON array string. A non-null value that fails to
// parse must fail closed: silently reading it as "no children" would mute the fork gate.
function unparsableChildrenFailure(branch: string, dbPath: string): LandStackFailure {
	return landStackFailure(
		`Graphite metadata children for ${branch} could not be parsed (${dbPath}); refusing to continue without an authoritative child list.`,
	);
}

export interface DerivePathToTrunkOptions {
	topology: GraphiteTopology;
	current: string;
	trunk: string;
	dbPath: string;
}

export function derivePathToTrunk(options: DerivePathToTrunkOptions): LandStackResult<string[]> {
	const { topology, current, trunk, dbPath } = options;
	if (current === trunk) return success([]);
	if (!topology.has(current)) {
		return failure(
			landStackFailure(`Current branch ${current} is not tracked in Graphite metadata (${dbPath}); run gt track or gt get before landing.`),
		);
	}

	const walked = walkGraphiteAncestors(topology, current);
	const path = [...walked.ancestors, current].filter((branch) => branch !== trunk);
	if (walked.termination.type === "completed" && walked.terminusBranch === trunk) return success(path);
	if (walked.termination.type === "cycle") {
		return failure(landStackFailure(`Graphite metadata parent chain from ${current} contains a cycle at ${walked.termination.branch}; refusing to land.`));
	}
	if (walked.termination.type === "row_missing") {
		return failure(landStackFailure(`Graphite metadata (${dbPath}) has no entry for ${walked.termination.branch} on the path from ${current} to ${trunk}; refusing to land.`));
	}
	return failure(
		landStackFailure(`Graphite metadata parent chain from ${current} ends at ${walked.terminusBranch} without reaching trunk ${trunk}; refusing to land.`, {
			suggestedAction: `Run gt sync or retarget the stack onto ${trunk}, then rerun /sdl:code:land.`,
		}),
	);
}

// gt restack --upstack rewrites the whole subtree above the current branch, so
// worktree-conflict detection and the confirmation prompt must cover all of it,
// not just the first-child chain.
export function deriveDescendantSubtree(topology: GraphiteTopology, current: string): LandStackResult<string[]> {
	const walked = walkGraphiteSubtree(topology, current);
	if (walked.cycleAt) {
		return failure(
			landStackFailure(`Graphite metadata descendants of ${current} contain a cycle at ${walked.cycleAt}; refusing to land.`),
		);
	}
	return success(walked.subtree.slice(1));
}

export function detectForkViolations(topology: GraphiteTopology, landingPath: string[]): ForkViolation[] {
	return [...detectGraphiteForkViolations(topology, landingPath)];
}

export function formatForkViolations(violations: ForkViolation[], trunk: string): LandStackFailure {
	const lines = violations.map((violation) => {
		if (violation.expectedChild === undefined) {
			const childNames = violation.siblings.map((sibling) => sibling.branch);
			return `Refusing to land: current branch ${violation.forkPoint} has ${childNames.length} children (${childNames.join(", ")}); /sdl:code:land supports at most one descendant chain target.`;
		}
		const siblingText = violation.siblings
			.map((sibling) => `${sibling.branch} (subtree: ${sibling.subtree.join(" -> ")})`)
			.join(", ");
		return `Refusing to land: the stack forks at ${violation.forkPoint}. Landing path expects ${violation.forkPoint} -> ${violation.expectedChild}, but ${violation.forkPoint} also has: ${siblingText}.`;
	});
	return landStackFailure(lines.join("\n"), {
		suggestedAction: `Land or move the sibling stack first (e.g. gt move --onto ${trunk}), then rerun /sdl:code:land.`,
	});
}
