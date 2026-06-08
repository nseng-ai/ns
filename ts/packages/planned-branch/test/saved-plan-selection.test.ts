import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	buildRepoPlanStoreKey,
	encodeBranchForPlanPath,
	extractSourceBranchPlanFileEvidenceFromSessionEntry,
	findLatestSessionSavedPlanFile,
	findLatestSessionSavedTsPlanFile,
	validateSessionSavedPlanCandidate,
	validateSessionSavedTsPlanCandidate,
	type PlanStoreDirectoryEvidence,
	type SourceBranchPlanFileEvidence,
} from "../src/index.ts";

const SOURCE_BRANCH = "feature/source-plan";
const PLAN_SLUG = "canonical-saved-plan";
const PLAN_KEY = `${PLAN_SLUG}.md`;
const PLAN_TS_KEY = `${PLAN_SLUG}.plan.ts`;
const ORIGIN = "git@github.com:owner/repo.git";

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("saved plan session selection", () => {
	test("returns the newest valid session evidence and preserves summary", async () => {
		const fixture = await makeFixture();
		const olderPath = await writePlanFile(fixture.directory, "older-valid-saved-plan.md", 1_700_000_000_000);
		const newerPath = await writePlanFile(fixture.directory, PLAN_KEY, 1_800_000_000_000);
		const entries = [
			{ type: "message", message: { role: "assistant", content: "ignore me" } },
			savedPlanEntry(evidence(fixture.directory, { slug: "older-valid-saved-plan", filePath: olderPath })),
			savedPlanEntry(evidence(fixture.directory, { filePath: newerPath, summary: "Use this plan." })),
		];

		const result = await findLatestSessionSavedPlanFile(entries, fixture.directory);

		expect(result).toMatchObject({
			type: "found",
			plan: {
				slug: PLAN_SLUG,
				filePath: newerPath,
				fileName: PLAN_KEY,
				summary: "Use this plan.",
			},
		});
	});

	test("returns the newest TypeScript recipe session evidence without selecting Markdown", async () => {
		const fixture = await makeFixture();
		const markdownPath = await writePlanFile(fixture.directory, PLAN_KEY, 1_900_000_000_000);
		const tsPath = await writePlanFile(fixture.directory, PLAN_TS_KEY, 1_800_000_000_000);
		const entries = [
			savedPlanEntry(evidence(fixture.directory, { filePath: markdownPath })),
			savedTsPlanEntry(evidence(fixture.directory, { filePath: tsPath })),
		];

		const result = await findLatestSessionSavedTsPlanFile(entries, fixture.directory);

		expect(result).toMatchObject({
			type: "found",
			plan: {
				slug: PLAN_SLUG,
				filePath: tsPath,
				fileName: PLAN_TS_KEY,
			},
		});
	});

	test("ignores unrelated and malformed entries", async () => {
		const fixture = await makeFixture();
		const entries = [
			{ type: "message", message: { role: "toolResult", toolName: "other_tool", isError: false, details: {} } },
			{ type: "message", message: { role: "toolResult", toolName: "write_source_branch_plan_file", isError: true, details: {} } },
			{ type: "message", message: { role: "toolResult", toolName: "write_source_branch_plan_file", details: { slug: 123 } } },
		];

		expect(extractSourceBranchPlanFileEvidenceFromSessionEntry(entries[0])).toBeUndefined();
		expect(await findLatestSessionSavedPlanFile(entries, fixture.directory)).toEqual({ type: "not-found" });
	});

	test("treats a missing session file as stale and continues to older valid evidence", async () => {
		const fixture = await makeFixture();
		const olderPath = await writePlanFile(fixture.directory, "older-valid-saved-plan.md", 1_700_000_000_000);
		const missingPath = join(fixture.directory.directoryPath, PLAN_KEY);
		const entries = [
			savedPlanEntry(evidence(fixture.directory, { slug: "older-valid-saved-plan", filePath: olderPath })),
			savedPlanEntry(evidence(fixture.directory, { filePath: missingPath })),
		];

		const result = await findLatestSessionSavedPlanFile(entries, fixture.directory);

		expect(result).toMatchObject({ type: "found", plan: { slug: "older-valid-saved-plan", filePath: olderPath } });
	});

	const unsafeCases: Array<{
		name: string;
		mutate(fixture: Fixture, filePath: string): SourceBranchPlanFileEvidence;
		expected: string;
	}> = [
		{
			name: "outside plan store path",
			mutate: (fixture, filePath) => evidence(fixture.directory, { filePath }),
			expected: "outside the current local plan store directory",
		},
		{
			name: "wrong repo root",
			mutate: (fixture, filePath) => ({ ...evidence(fixture.directory, { filePath }), repoRoot: "/other/repo" }),
			expected: "repoRoot",
		},
		{
			name: "wrong repo key",
			mutate: (fixture, filePath) => ({ ...evidence(fixture.directory, { filePath }), repoKey: "gh--other--repo" }),
			expected: "repoKey",
		},
		{
			name: "wrong repo identity source",
			mutate: (fixture, filePath) => ({ ...evidence(fixture.directory, { filePath }), repoIdentitySource: "repo-root" }),
			expected: "repoIdentitySource",
		},
		{
			name: "wrong source branch",
			mutate: (fixture, filePath) => ({ ...evidence(fixture.directory, { filePath }), sourceBranch: "other-branch" }),
			expected: "sourceBranch",
		},
		{
			name: "wrong branch key",
			mutate: (fixture, filePath) => ({ ...evidence(fixture.directory, { filePath }), branchKey: "other-branch" }),
			expected: "branchKey",
		},
		{
			name: "basename slug mismatch",
			mutate: (fixture, filePath) => evidence(fixture.directory, { slug: "other-valid-saved-plan", filePath }),
			expected: "basename must match slug",
		},
		{
			name: "invalid slug",
			mutate: (fixture, filePath) => evidence(fixture.directory, { slug: "bad", filePath }),
			expected: "invalid slug",
		},
	];

	for (const unsafeCase of unsafeCases) {
		test(`rejects unsafe session evidence: ${unsafeCase.name}`, async () => {
			const fixture = await makeFixture();
			const filePath = unsafeCase.name === "outside plan store path"
				? await writeOutsidePlanFile()
				: await writePlanFile(fixture.directory, PLAN_KEY, 1_800_000_000_000);

			const result = await validateSessionSavedPlanCandidate(unsafeCase.mutate(fixture, filePath), fixture.directory);

			expect(result.type).toBe("unsafe");
			if (result.type === "unsafe") {
				expect(result.message).toContain(unsafeCase.expected);
			}
		});
	}

	test("validates TypeScript recipe session evidence suffix and basename", async () => {
		const fixture = await makeFixture();
		const tsPath = await writePlanFile(fixture.directory, PLAN_TS_KEY, 1_800_000_000_000);
		const markdownPath = await writePlanFile(fixture.directory, PLAN_KEY, 1_800_000_000_000);

		const valid = await validateSessionSavedTsPlanCandidate(evidence(fixture.directory, { filePath: tsPath }), fixture.directory);
		const wrongSuffix = await validateSessionSavedTsPlanCandidate(evidence(fixture.directory, { filePath: markdownPath }), fixture.directory);

		expect(valid.type).toBe("valid");
		expect(wrongSuffix.type).toBe("unsafe");
		if (wrongSuffix.type === "unsafe") {
			expect(wrongSuffix.message).toContain(".plan.ts filename");
		}
	});
});

interface Fixture {
	root: string;
	directory: PlanStoreDirectoryEvidence;
}

async function makeFixture(): Promise<Fixture> {
	const root = await makeTempDir();
	const planStoreRoot = await makeTempDir();
	const repoKey = buildRepoPlanStoreKey(root, ORIGIN);
	const branchKey = encodeBranchForPlanPath(SOURCE_BRANCH);
	return {
		root,
		directory: {
			repoRoot: root,
			repoKey,
			repoIdentitySource: "origin-url",
			sourceBranch: SOURCE_BRANCH,
			branchKey,
			directoryPath: join(planStoreRoot, repoKey, branchKey),
		},
	};
}

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "saved-plan-selection-test-"));
	tempDirs.push(dir);
	return dir;
}

async function writePlanFile(directory: PlanStoreDirectoryEvidence, fileName: string, modifiedTimeMs: number): Promise<string> {
	await mkdir(directory.directoryPath, { recursive: true });
	const filePath = join(directory.directoryPath, fileName);
	await writeFile(filePath, `# ${fileName}\n`, "utf8");
	const modified = new Date(modifiedTimeMs);
	await utimes(filePath, modified, modified);
	return filePath;
}

async function writeOutsidePlanFile(): Promise<string> {
	const dir = await makeTempDir();
	const filePath = join(dir, PLAN_KEY);
	await writeFile(filePath, "# Outside\n", "utf8");
	return filePath;
}

function evidence(
	directory: PlanStoreDirectoryEvidence,
	overrides: { slug?: string; filePath: string; summary?: string },
): SourceBranchPlanFileEvidence {
	return {
		slug: overrides.slug ?? PLAN_SLUG,
		repoRoot: directory.repoRoot,
		repoKey: directory.repoKey,
		repoIdentitySource: directory.repoIdentitySource,
		sourceBranch: directory.sourceBranch,
		branchKey: directory.branchKey,
		filePath: overrides.filePath,
		...(overrides.summary === undefined ? {} : { summary: overrides.summary }),
	};
}

function savedPlanEntry(plan: SourceBranchPlanFileEvidence): unknown {
	return savedPlanEntryForTool(plan, "write_source_branch_plan_file");
}

function savedTsPlanEntry(plan: SourceBranchPlanFileEvidence): unknown {
	return savedPlanEntryForTool(plan, "write_source_branch_ts_plan_file");
}

function savedPlanEntryForTool(plan: SourceBranchPlanFileEvidence, toolName: string): unknown {
	return {
		type: "message",
		message: {
			role: "toolResult",
			toolName,
			isError: false,
			details: plan,
		},
	};
}
