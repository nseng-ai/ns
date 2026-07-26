import { describe, expect, test } from "vitest";
import { join } from "node:path";

import {
	buildPlanStoreBranchDirectoryPath,
	buildRepoPlanStoreKey,
	encodeBranchForPlanPath,
	extractSavedPlanFileEvidenceFromSessionEntry,
	findLatestSessionSavedPlanFile,
	validateSessionSavedPlanCandidate,
	type PlanStoreDirectoryEvidence,
	type SavedPlanFileEvidence,
} from "../src/index.ts";
import { prepareLatestSessionSavedPlan } from "../src/api.ts";
import { InMemoryPlanStoreGateway } from "../src/testing.ts";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";

const SOURCE_BRANCH = "feature/source-plan";
const PLAN_SLUG = "canonical-saved-plan";
const PLAN_KEY = `${PLAN_SLUG}.md`;
const ORIGIN = "git@github.com:owner/repo.git";

describe("prepareLatestSessionSavedPlan", () => {
	const commands: CommandExecApi = {
		async exec() {
			throw new Error("unexpected command execution");
		},
	};

	test("returns directory evidence with the latest validated session plan", async () => {
		const fixture = await makeFixture();
		const filePath = await writePlanFile(fixture, fixture.directory, PLAN_KEY, 1_800_000_000_000);
		const git = new InMemoryGitGateway({
			repoRoot: fixture.root,
			optionalRepoRoot: fixture.root,
			currentBranch: SOURCE_BRANCH,
			originUrl: ORIGIN,
		});

		const result = await prepareLatestSessionSavedPlan(commands, {
			cwd: fixture.root,
			planStoreRoot: planStoreRoot(fixture),
			entries: [savedPlanEntry(evidence(fixture.directory, { filePath }))],
			git,
			planStoreGateway: fixture.planStoreGateway,
		});

		expect(result).toMatchObject({
			ok: true,
			directory: fixture.directory,
			plan: { filePath, slug: PLAN_SLUG },
		});
	});

	test("returns the caller-neutral not-found message", async () => {
		const fixture = await makeFixture();
		const git = new InMemoryGitGateway({
			repoRoot: fixture.root,
			optionalRepoRoot: fixture.root,
			currentBranch: SOURCE_BRANCH,
			originUrl: ORIGIN,
		});

		const result = await prepareLatestSessionSavedPlan(commands, {
			cwd: fixture.root,
			planStoreRoot: planStoreRoot(fixture),
			entries: [],
			git,
			planStoreGateway: fixture.planStoreGateway,
		});

		expect(result).toEqual({
			ok: false,
			error:
				"No saved plan from /ns:plan:save was found in the current session branch.\nRun /ns:plan:save first, then rerun the dispatch command.",
		});
	});

	test("rejects unsafe selected-plan evidence through the public operation", async () => {
		const fixture = await makeFixture();
		const outsidePath = await writeOutsidePlanFile(fixture);
		const git = new InMemoryGitGateway({
			repoRoot: fixture.root,
			optionalRepoRoot: fixture.root,
			currentBranch: SOURCE_BRANCH,
			originUrl: ORIGIN,
		});

		const result = await prepareLatestSessionSavedPlan(commands, {
			cwd: fixture.root,
			planStoreRoot: planStoreRoot(fixture),
			entries: [savedPlanEntry(evidence(fixture.directory, { filePath: outsidePath }))],
			git,
			planStoreGateway: fixture.planStoreGateway,
		});

		expect(result).toMatchObject({ ok: false, error: expect.stringContaining("outside") });
	});
});

describe("saved plan session selection", () => {
	test("returns the newest valid session evidence and preserves summary", async () => {
		const fixture = await makeFixture();
		const olderPath = await writePlanFile(
			fixture,
			fixture.directory,
			"older-valid-saved-plan.md",
			1_700_000_000_000,
		);
		const newerPath = await writePlanFile(fixture, fixture.directory, PLAN_KEY, 1_800_000_000_000);
		const entries = [
			{ type: "message", message: { role: "assistant", content: "ignore me" } },
			savedPlanEntry(
				evidence(fixture.directory, { slug: "older-valid-saved-plan", filePath: olderPath }),
			),
			savedPlanEntry(
				evidence(fixture.directory, { filePath: newerPath, summary: "Use this plan." }),
			),
		];

		const result = await findLatestSessionSavedPlanFile(entries, fixture.directory, {
			planStoreGateway: fixture.planStoreGateway,
		});

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
		expect(
			await findLatestSessionSavedPlanFile(entries, fixture.directory, {
				planStoreGateway: fixture.planStoreGateway,
			}),
		).toEqual({
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
			fixture,
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

		const result = await findLatestSessionSavedPlanFile(entries, fixture.directory, {
			planStoreGateway: fixture.planStoreGateway,
		});

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
				branchKey: encodeBranchForPlanPath("other-branch"),
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
					? await writeOutsidePlanFile(fixture)
					: await writePlanFile(fixture, fixture.directory, PLAN_KEY, 1_800_000_000_000);

			const result = await validateSessionSavedPlanCandidate(
				unsafeCase.mutate(fixture, filePath),
				fixture.directory,
				{ planStoreGateway: fixture.planStoreGateway },
			);

			expect(result.type).toBe("unsafe");
			if (result.type === "unsafe") {
				expect(result.message).toContain(unsafeCase.expected);
			}
		});
	}

	test("allows same-repo session evidence from a different source branch when requested", async () => {
		const fixture = await makeFixture();
		const sourceBranch = "feature/planning-branch";
		const branchKey = encodeBranchForPlanPath(sourceBranch);
		const directoryPath = buildPlanStoreBranchDirectoryPath({
			repoDirectoryPath: fixture.directory.repoDirectoryPath,
			branchKey,
		});
		const sourceDirectory = { ...fixture.directory, sourceBranch, branchKey, directoryPath };
		const filePath = await writePlanFile(fixture, sourceDirectory, PLAN_KEY, 1_800_000_000_000);

		const result = await validateSessionSavedPlanCandidate(
			evidence(sourceDirectory, { filePath }),
			fixture.directory,
			{
				shouldAllowSourceBranchMismatch: true,
				planStoreGateway: fixture.planStoreGateway,
			},
		);

		expect(result).toMatchObject({
			type: "valid",
			plan: {
				sourceBranch,
				branchKey,
				directoryPath,
				filePath,
			},
		});
	});
});

interface Fixture {
	root: string;
	directory: PlanStoreDirectoryEvidence;
	planStoreGateway: InMemoryPlanStoreGateway;
}

function planStoreRoot(fixture: Fixture): string {
	return fixture.directory.repoDirectoryPath.slice(
		0,
		fixture.directory.repoDirectoryPath.length - `/${fixture.directory.repoKey}`.length,
	);
}

async function makeFixture(): Promise<Fixture> {
	const root = makeTempDir();
	const planStoreRoot = makeTempDir();
	const repoKey = buildRepoPlanStoreKey(root, ORIGIN);
	const branchKey = encodeBranchForPlanPath(SOURCE_BRANCH);
	const repoDirectoryPath = join(planStoreRoot, repoKey);
	return {
		root,
		planStoreGateway: new InMemoryPlanStoreGateway(),
		directory: {
			repoRoot: root,
			repoKey,
			repoIdentitySource: "origin-url",
			repoDirectoryPath,
			sourceBranch: SOURCE_BRANCH,
			branchKey,
			directoryPath: buildPlanStoreBranchDirectoryPath({ repoDirectoryPath, branchKey }),
		},
	};
}

let tempDirCounter = 0;
function makeTempDir(): string {
	tempDirCounter += 1;
	return `/saved-plan-selection-test-${tempDirCounter}`;
}

async function writePlanFile(
	fixture: Fixture,
	directory: PlanStoreDirectoryEvidence,
	fileName: string,
	modifiedTimeMs: number,
): Promise<string> {
	const filePath = join(directory.directoryPath, fileName);
	fixture.planStoreGateway.writeFile(filePath, `# ${fileName}\n`, { mtimeMs: modifiedTimeMs });
	return filePath;
}

async function writeOutsidePlanFile(fixture: Fixture): Promise<string> {
	const dir = makeTempDir();
	const filePath = join(dir, PLAN_KEY);
	fixture.planStoreGateway.writeFile(filePath, "# Outside\n");
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
