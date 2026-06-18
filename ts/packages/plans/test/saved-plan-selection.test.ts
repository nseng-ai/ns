import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	buildRepoPlanStoreKey,
	encodeBranchForPlanPath,
	extractSavedPlanFileEvidenceFromSessionEntry,
	findLatestSessionSavedPlanFile,
	validateSessionSavedPlanCandidate,
	type PlanStoreDirectoryEvidence,
	type SavedPlanFileEvidence,
} from "../src/index.ts";

const SOURCE_BRANCH = "feature/source-plan";
const PLAN_SLUG = "canonical-saved-plan";
const PLAN_KEY = `${PLAN_SLUG}.md`;
const ORIGIN = "git@github.com:owner/repo.git";

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("saved plan session selection", () => {
	test("returns the newest valid session evidence and preserves summary", async () => {
		const fixture = await makeFixture();
		const olderPath = await writePlanFile(
			fixture.directory,
			"older-valid-saved-plan.md",
			1_700_000_000_000,
		);
		const newerPath = await writePlanFile(fixture.directory, PLAN_KEY, 1_800_000_000_000);
		const entries = [
			{ type: "message", message: { role: "assistant", content: "ignore me" } },
			savedPlanEntry(
				evidence(fixture.directory, { slug: "older-valid-saved-plan", filePath: olderPath }),
			),
			savedPlanEntry(
				evidence(fixture.directory, { filePath: newerPath, summary: "Use this plan." }),
			),
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

	test("ignores unrelated and malformed entries", async () => {
		const fixture = await makeFixture();
		const entries = [
			{
				type: "message",
				message: { role: "toolResult", toolName: "other_tool", isError: false, details: {} },
			},
			{
				type: "message",
				message: {
					role: "toolResult",
					toolName: "write_saved_plan_file",
					isError: true,
					details: {},
				},
			},
			{
				type: "message",
				message: { role: "toolResult", toolName: "write_saved_plan_file", details: { slug: 123 } },
			},
		];

		expect(extractSavedPlanFileEvidenceFromSessionEntry(entries[0])).toBeUndefined();
		expect(await findLatestSessionSavedPlanFile(entries, fixture.directory)).toEqual({
			type: "not-found",
		});
	});

	test("accepts but strips unknown session entry, message, and evidence keys", async () => {
		const fixture = await makeFixture();
		const plan = evidence(fixture.directory, {
			filePath: join(fixture.directory.directoryPath, PLAN_KEY),
			summary: "Use this plan.",
		});
		const result = extractSavedPlanFileEvidenceFromSessionEntry({
			type: "message",
			entryExtra: "ignored",
			message: {
				role: "toolResult",
				toolName: "write_saved_plan_file",
				isError: false,
				messageExtra: "ignored",
				details: { ...plan, evidenceExtra: "ignored" },
			},
		});

		expect(result).toEqual(plan);
		expect(result).not.toHaveProperty("evidenceExtra");
	});

	test("rejects malformed summary evidence", async () => {
		const fixture = await makeFixture();
		const plan = evidence(fixture.directory, {
			filePath: join(fixture.directory.directoryPath, PLAN_KEY),
		});

		expect(
			extractSavedPlanFileEvidenceFromSessionEntry({
				type: "message",
				message: {
					role: "toolResult",
					toolName: "write_saved_plan_file",
					details: { ...plan, summary: 123 },
				},
			}),
		).toBeUndefined();
	});

	test("only rejects literal true tool errors", async () => {
		const fixture = await makeFixture();
		const plan = evidence(fixture.directory, {
			filePath: join(fixture.directory.directoryPath, PLAN_KEY),
		});

		expect(
			extractSavedPlanFileEvidenceFromSessionEntry({
				type: "message",
				message: {
					role: "toolResult",
					toolName: "write_saved_plan_file",
					isError: true,
					details: plan,
				},
			}),
		).toBeUndefined();
		expect(
			extractSavedPlanFileEvidenceFromSessionEntry({
				type: "message",
				message: {
					role: "toolResult",
					toolName: "write_saved_plan_file",
					isError: "true",
					details: plan,
				},
			}),
		).toEqual(plan);
	});

	test("treats a missing session file as stale and continues to older valid evidence", async () => {
		const fixture = await makeFixture();
		const olderPath = await writePlanFile(
			fixture.directory,
			"older-valid-saved-plan.md",
			1_700_000_000_000,
		);
		const missingPath = join(fixture.directory.directoryPath, PLAN_KEY);
		const entries = [
			savedPlanEntry(
				evidence(fixture.directory, { slug: "older-valid-saved-plan", filePath: olderPath }),
			),
			savedPlanEntry(evidence(fixture.directory, { filePath: missingPath })),
		];

		const result = await findLatestSessionSavedPlanFile(entries, fixture.directory);

		expect(result).toMatchObject({
			type: "found",
			plan: { slug: "older-valid-saved-plan", filePath: olderPath },
		});
	});

	const unsafeCases: Array<{
		name: string;
		mutate(fixture: Fixture, filePath: string): SavedPlanFileEvidence;
		expected: string;
	}> = [
		{
			name: "outside plan store path",
			mutate: (fixture, filePath) => evidence(fixture.directory, { filePath }),
			expected: "outside the current local plan store directory",
		},
		{
			name: "wrong repo root",
			mutate: (fixture, filePath) => ({
				...evidence(fixture.directory, { filePath }),
				repoRoot: "/other/repo",
			}),
			expected: "repoRoot",
		},
		{
			name: "wrong repo key",
			mutate: (fixture, filePath) => ({
				...evidence(fixture.directory, { filePath }),
				repoKey: "gh--other--repo",
			}),
			expected: "repoKey",
		},
		{
			name: "wrong repo identity source",
			mutate: (fixture, filePath) => ({
				...evidence(fixture.directory, { filePath }),
				repoIdentitySource: "repo-root",
			}),
			expected: "repoIdentitySource",
		},
		{
			name: "wrong source branch",
			mutate: (fixture, filePath) => ({
				...evidence(fixture.directory, { filePath }),
				sourceBranch: "other-branch",
			}),
			expected: "sourceBranch",
		},
		{
			name: "wrong branch key",
			mutate: (fixture, filePath) => ({
				...evidence(fixture.directory, { filePath }),
				branchKey: "other-branch",
			}),
			expected: "branchKey",
		},
		{
			name: "basename slug mismatch",
			mutate: (fixture, filePath) =>
				evidence(fixture.directory, { slug: "other-valid-saved-plan", filePath }),
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
			const filePath =
				unsafeCase.name === "outside plan store path"
					? await writeOutsidePlanFile()
					: await writePlanFile(fixture.directory, PLAN_KEY, 1_800_000_000_000);

			const result = await validateSessionSavedPlanCandidate(
				unsafeCase.mutate(fixture, filePath),
				fixture.directory,
			);

			expect(result.type).toBe("unsafe");
			if (result.type === "unsafe") {
				expect(result.message).toContain(unsafeCase.expected);
			}
		});
	}
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

async function writePlanFile(
	directory: PlanStoreDirectoryEvidence,
	fileName: string,
	modifiedTimeMs: number,
): Promise<string> {
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
): SavedPlanFileEvidence {
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

function savedPlanEntry(plan: SavedPlanFileEvidence): unknown {
	return savedPlanEntryForTool(plan, "write_saved_plan_file");
}

function savedPlanEntryForTool(plan: SavedPlanFileEvidence, toolName: string): unknown {
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
