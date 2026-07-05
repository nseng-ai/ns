/**
 * Per-PR objective attribution for the `/stack:view` panel: which durable
 * Objectives a branch touches relative to its parent. We diff the branch against
 * its parent restricted to `.ns/objectives` and map the changed paths to slugs.
 *
 * The path→slug mapping is intentionally local: package-tier layering forbids
 * this internal Pi tool from depending on the `@nseng-ai/objective` capability package.
 * The branch-diffing wrapper is the genuinely stack-view-specific logic.
 *
 * Error model matches `graphql.ts`: exec failure is a typed error value, never a
 * throw. A successful diff with no objective paths simply yields an empty list.
 */
import type { StackViewExecContext } from "./exec.ts";
import type { StackBranchLineage } from "./types.ts";
import { commandFailureReason, commandSucceeded } from "@nseng-ai/foundation/exec";

const OBJECTIVES_ROOT = ".ns/objectives";

export interface ObjectiveSlugsForBranchParams extends StackViewExecContext {
	lineage: StackBranchLineage;
}

export type ObjectiveSlugsResult =
	| { type: "ok"; slugs: string[] }
	| { type: "exec-error"; message: string };

/**
 * Return the sorted, unique objective slugs a branch touches relative to its
 * parent, by diffing `<parent>...<branch>` restricted to `.ns/objectives`.
 */
export async function objectiveSlugsForBranch(
	params: ObjectiveSlugsForBranchParams,
): Promise<ObjectiveSlugsResult> {
	const result = await params.execApi.exec(
		"git",
		[
			"diff",
			"--name-only",
			"-z",
			`${params.lineage.parentBranch}...${params.lineage.branch}`,
			"--",
			OBJECTIVES_ROOT,
		],
		{ cwd: params.cwd },
	);
	if (!commandSucceeded(result))
		return { type: "exec-error", message: commandFailureReason(result) };
	return { type: "ok", slugs: objectiveSlugsFromDiffOutput(result.stdout) };
}

/**
 * Map the NUL-separated output of `git diff --name-only -z` to sorted, unique
 * objective slugs. Robust to odd/adversarial paths: `-z` avoids git's path
 * quoting, and anything not shaped like `.ns/objectives/<slug>/<child>` is
 * ignored (paths outside the root, the bare root, empty/degenerate segments).
 */
export function objectiveSlugsFromDiffOutput(stdout: string): string[] {
	const slugs = new Set<string>();
	for (const path of stdout.split("\0")) {
		const slug = objectiveSlugFromPath(path);
		if (slug !== null) slugs.add(slug);
	}
	return [...slugs].sort((left, right) => left.localeCompare(right));
}

function objectiveSlugFromPath(path: string): string | null {
	const prefix = `${OBJECTIVES_ROOT}/`;
	if (!path.startsWith(prefix)) return null;

	const rest = path.slice(prefix.length);
	const separatorIndex = rest.indexOf("/");
	if (separatorIndex < 0) return null;

	const slug = rest.slice(0, separatorIndex);
	const childPath = rest.slice(separatorIndex + 1);
	if (childPath.length === 0) return null;
	if (!isValidObjectiveSlug(slug)) return null;
	return slug;
}

function isValidObjectiveSlug(slug: string): boolean {
	return (
		slug !== "" && slug !== "." && slug !== ".." && !slug.includes("/") && !slug.includes("\\")
	);
}
