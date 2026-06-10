import { join } from "node:path";

import { formatCommand } from "@asdl/core/exec";
import { isRecord } from "@asdl/core/primitives";
import { exec, formatCommandDetails } from "./command-exec.ts";
import { GIT_TIMEOUT_MS, GRAPHITE_METADATA_DB_NAME, SQLITE_TIMEOUT_MS } from "./constants.ts";
import { failure, landStackFailure, success, type LandStackFailure, type LandStackResult } from "./errors.ts";
import type { LandStackExtensionAPI } from "./types.ts";

const TOPOLOGY_QUERY = "SELECT branch_name, parent_branch_name, children, validation_result FROM branch_metadata";

export interface GraphiteBranchTopology {
	parent: string | undefined;
	children: string[];
	isTrunkMarked: boolean;
}

export type GraphiteTopology = ReadonlyMap<string, GraphiteBranchTopology>;

export interface ForkViolation {
	forkPoint: string;
	/** The next landing-path branch the fork point must lead to; undefined when the fork is at the current branch. */
	expectedChild: string | undefined;
	siblings: Array<{ branch: string; subtree: string[] }>;
}

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
	const args = ["-readonly", "-json", dbPath, TOPOLOGY_QUERY];
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
	if (!Array.isArray(raw)) {
		return failure(
			landStackFailure(`sqlite3 returned non-array JSON for the Graphite metadata DB at ${dbPath}; refusing to land.`, {
				commandDisplay: formatCommand("sqlite3", args),
				result,
			}),
		);
	}

	const topology = new Map<string, GraphiteBranchTopology>();
	for (const row of raw) {
		if (!isRecord(row) || typeof row.branch_name !== "string" || row.branch_name.length === 0) {
			return failure(
				landStackFailure(`Graphite metadata DB at ${dbPath} returned a row without a branch_name; refusing to land.`),
			);
		}
		const children = parseChildrenColumn(row.children, row.branch_name, dbPath);
		if (children.type === "failure") return children;
		topology.set(row.branch_name, {
			parent: optionalText(row.parent_branch_name),
			children: children.value,
			isTrunkMarked: optionalText(row.validation_result)?.toUpperCase() === "TRUNK",
		});
	}
	return success(topology);
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
function parseChildrenColumn(value: unknown, branch: string, dbPath: string): LandStackResult<string[]> {
	if (value === null || value === undefined || value === "") return success([]);
	if (typeof value !== "string") {
		return failure(unparsableChildrenFailure(branch, dbPath));
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return failure(unparsableChildrenFailure(branch, dbPath));
	}
	if (!Array.isArray(parsed) || !parsed.every((item): item is string => typeof item === "string")) {
		return failure(unparsableChildrenFailure(branch, dbPath));
	}
	return success(parsed);
}

function unparsableChildrenFailure(branch: string, dbPath: string): LandStackFailure {
	return landStackFailure(
		`Graphite metadata children for ${branch} could not be parsed (${dbPath}); refusing to continue without an authoritative child list.`,
	);
}

function optionalText(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const text = value.trim();
	return text.length > 0 ? text : undefined;
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

	const path: string[] = [];
	const visited = new Set<string>();
	let cursor = current;
	while (cursor !== trunk) {
		if (visited.has(cursor)) {
			return failure(
				landStackFailure(`Graphite metadata parent chain from ${current} contains a cycle at ${cursor}; refusing to land.`),
			);
		}
		visited.add(cursor);
		path.push(cursor);

		const entry = topology.get(cursor);
		if (!entry) {
			return failure(
				landStackFailure(`Graphite metadata (${dbPath}) has no entry for ${cursor} on the path from ${current} to ${trunk}; refusing to land.`),
			);
		}
		if (entry.parent === undefined) {
			return failure(
				landStackFailure(
					`Graphite metadata parent chain from ${current} ends at ${cursor} without reaching trunk ${trunk}; refusing to land.`,
					{ suggestedAction: `Run gt sync or retarget the stack onto ${trunk}, then rerun /code:land.` },
				),
			);
		}
		cursor = entry.parent;
	}
	return success(path.reverse());
}

// gt restack --upstack rewrites the whole subtree above the current branch, so
// worktree-conflict detection and the confirmation prompt must cover all of it,
// not just the first-child chain.
export function deriveDescendantSubtree(topology: GraphiteTopology, current: string): LandStackResult<string[]> {
	const walked = walkSubtree(topology, current);
	if (walked.cycleAt) {
		return failure(
			landStackFailure(`Graphite metadata descendants of ${current} contain a cycle at ${walked.cycleAt}; refusing to land.`),
		);
	}
	return success(walked.subtree.slice(1));
}

export function detectForkViolations(topology: GraphiteTopology, landingPath: string[]): ForkViolation[] {
	const violations: ForkViolation[] = [];
	for (let index = 0; index < landingPath.length; index += 1) {
		const branch = landingPath[index];
		if (branch === undefined) continue;
		const children = topology.get(branch)?.children ?? [];
		const expectedChild = landingPath[index + 1];

		if (expectedChild === undefined) {
			if (children.length > 1) {
				violations.push({ forkPoint: branch, expectedChild: undefined, siblings: children.map((child) => siblingSubtree(topology, child)) });
			}
			continue;
		}

		const extras = children.filter((child) => child !== expectedChild);
		if (extras.length > 0) {
			violations.push({ forkPoint: branch, expectedChild, siblings: extras.map((child) => siblingSubtree(topology, child)) });
		}
	}
	return violations;
}

function siblingSubtree(topology: GraphiteTopology, sibling: string): { branch: string; subtree: string[] } {
	return { branch: sibling, subtree: walkSubtree(topology, sibling).subtree };
}

function walkSubtree(topology: GraphiteTopology, root: string): { subtree: string[]; cycleAt?: string } {
	const subtree = [root];
	const visited = new Set<string>([root]);
	const pending = [...(topology.get(root)?.children ?? [])].reverse();
	while (pending.length > 0) {
		const branch = pending.pop();
		if (branch === undefined) break;
		if (visited.has(branch)) return { subtree, cycleAt: branch };
		visited.add(branch);
		subtree.push(branch);
		const children = topology.get(branch)?.children ?? [];
		for (let index = children.length - 1; index >= 0; index -= 1) {
			const child = children[index];
			if (child !== undefined) pending.push(child);
		}
	}
	return { subtree };
}

export function formatForkViolations(violations: ForkViolation[], trunk: string): LandStackFailure {
	const lines = violations.map((violation) => {
		if (violation.expectedChild === undefined) {
			const childNames = violation.siblings.map((sibling) => sibling.branch);
			return `Refusing to land: current branch ${violation.forkPoint} has ${childNames.length} children (${childNames.join(", ")}); /code:land supports at most one descendant chain target.`;
		}
		const siblingText = violation.siblings
			.map((sibling) => `${sibling.branch} (subtree: ${sibling.subtree.join(" -> ")})`)
			.join(", ");
		return `Refusing to land: the stack forks at ${violation.forkPoint}. Landing path expects ${violation.forkPoint} -> ${violation.expectedChild}, but ${violation.forkPoint} also has: ${siblingText}.`;
	});
	return landStackFailure(lines.join("\n"), {
		suggestedAction: `Land or move the sibling stack first (e.g. gt move --onto ${trunk}), then rerun /code:land.`,
	});
}
