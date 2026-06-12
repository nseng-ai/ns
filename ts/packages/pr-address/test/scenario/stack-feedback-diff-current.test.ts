import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import { InMemoryLegacyPrAddressGateway } from "../support/in-memory-legacy-pr-address-gateway.ts";

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "pr-address-stack-diff-"));
	tempDirs.push(dir);
	return dir;
}

interface CliRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	legacy: InMemoryLegacyPrAddressGateway;
}

interface DiffEnvelope {
	message?: string | undefined;
	data: {
		safe_to_resolve_planned: boolean;
		summary: Record<string, number>;
		missing_or_outdated_planned_threads: Array<Record<string, unknown>>;
		new_unresolved_threads: Array<Record<string, unknown>>;
		errors: Array<{ code: string }>;
	};
}

function runDiffWithArgs(args: readonly string[], stdinText = ""): CliRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const legacy = new InMemoryLegacyPrAddressGateway([0]);
	return {
		exit: runCli(["exec", "stack-feedback-diff-current", ...args, "--format", "json"], {
			context: { legacy },
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			stdin: async () => stdinText,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
		legacy,
	};
}

function runDiff(payload: unknown): CliRun {
	return runDiffWithArgs([], JSON.stringify(payload));
}

describe("stack-feedback-diff-current", () => {
	test("returns ok when planned actionable threads still match current feedback", async () => {
		const run = runDiff({
			stack_plan: stackPlan({ threadId: "PRRT_1" }),
			current_prep: currentPrep({ shouldIncludeResolved: true, threads: [thread({ thread_id: "PRRT_1", is_resolved: false })] }),
		});

		expect(await run.exit).toBe(0);
		expect(run.legacy.calls).toEqual([]);
		const envelope = parseDiffEnvelope(run.stdout.join(""));
		expect(envelope.data.safe_to_resolve_planned).toBe(true);
		expect(envelope.data.summary).toMatchObject({ planned_still_unresolved: 1, new_unresolved_threads: 0 });
	});

	test("returns negative when current feedback has drift", async () => {
		const run = runDiff({
			stack_plan: stackPlan({ threadId: "PRRT_1" }),
			current_prep: currentPrep({ shouldIncludeResolved: true, threads: [thread({ thread_id: "PRRT_1", path: "renamed.ts", is_resolved: false }), thread({ thread_id: "PRRT_new", is_resolved: false })] }),
		});

		expect(await run.exit).toBe(1);
		const envelope = parseDiffEnvelope(run.stdout.join(""));
		expect(envelope.message).toContain("Current stack feedback differs");
		expect(envelope.data.safe_to_resolve_planned).toBe(false);
		expect(envelope.data.missing_or_outdated_planned_threads[0]).toMatchObject({ thread_id: "PRRT_1", reason: "metadata_changed", changed_fields: ["path"] });
		expect(envelope.data.new_unresolved_threads[0]).toMatchObject({ thread_id: "PRRT_new" });
	});

	test("validates stack membership and duplicate planned threads", async () => {
		const plan = stackPlan({ threadId: "PRRT_1" });
		plan.batches[0]?.items.push({ ...plan.batches[0].items[0] });
		const run = runDiff({
			stack_plan: plan,
			current_prep: currentPrep({ shouldIncludeResolved: true, prNumber: 100, threads: [thread({ thread_id: "PRRT_1" })] }),
		});

		expect(await run.exit).toBe(1);
		const codes = parseDiffEnvelope(run.stdout.join(""));
		expect(codes.data.errors.map((error) => error.code)).toEqual(["missing_current_pr", "unknown_current_pr", "duplicate_planned_thread"]);
	});
});

describe("stack-feedback-diff-current reference inputs", () => {
	function referencedCurrentPrep(): Record<string, unknown> {
		return { ...currentPrep({ shouldIncludeResolved: true, threads: [thread()] }), summary: { prs: 1 } };
	}

	function errorEnvelope(run: CliRun): { error_type: string; message: string } {
		return JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
	}

	test("diffs from --stack-plan-reference and --current-prep-reference without a payload", async () => {
		const dir = await makeTempDir();
		const planPath = join(dir, "stack-plan.json");
		const prepPath = join(dir, "current-prep.json");
		await writeFile(planPath, JSON.stringify(stackPlan({ threadId: "PRRT_1" })), "utf8");
		await writeFile(prepPath, JSON.stringify(referencedCurrentPrep()), "utf8");

		const run = runDiffWithArgs(["--stack-plan-reference", planPath, "--current-prep-reference", prepPath]);

		expect(await run.exit).toBe(0);
		expect(run.legacy.calls).toEqual([]);
		const envelope = parseDiffEnvelope(run.stdout.join(""));
		expect(envelope.data.safe_to_resolve_planned).toBe(true);
		expect(envelope.data.summary).toMatchObject({ planned_still_unresolved: 1, new_unresolved_threads: 0 });
	});

	test("combines one reference with the embedded payload key", async () => {
		const dir = await makeTempDir();
		const planPath = join(dir, "stack-plan.json");
		await writeFile(planPath, JSON.stringify(stackPlan({ threadId: "PRRT_1" })), "utf8");

		const run = runDiffWithArgs(
			["--stack-plan-reference", planPath],
			JSON.stringify({ current_prep: currentPrep({ shouldIncludeResolved: true, threads: [thread()] }) }),
		);

		expect(await run.exit).toBe(0);
		expect(parseDiffEnvelope(run.stdout.join("")).data.safe_to_resolve_planned).toBe(true);
	});

	test("rejects --stack-plan-reference combined with an embedded stack_plan key", async () => {
		const dir = await makeTempDir();
		const planPath = join(dir, "stack-plan.json");
		await writeFile(planPath, JSON.stringify(stackPlan({ threadId: "PRRT_1" })), "utf8");

		const run = runDiffWithArgs(
			["--stack-plan-reference", planPath],
			JSON.stringify({ stack_plan: stackPlan({ threadId: "PRRT_1" }), current_prep: referencedCurrentPrep() }),
		);

		expect(await run.exit).toBe(2);
		const envelope = errorEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("cannot mix an embedded stack_plan payload key with --stack-plan-reference");
	});

	test("rejects --current-prep-reference combined with an embedded current_prep key", async () => {
		const dir = await makeTempDir();
		const planPath = join(dir, "stack-plan.json");
		const prepPath = join(dir, "current-prep.json");
		await writeFile(planPath, JSON.stringify(stackPlan({ threadId: "PRRT_1" })), "utf8");
		await writeFile(prepPath, JSON.stringify(referencedCurrentPrep()), "utf8");

		const run = runDiffWithArgs(
			["--stack-plan-reference", planPath, "--current-prep-reference", prepPath, "--payload-json", JSON.stringify({ current_prep: referencedCurrentPrep() })],
		);

		expect(await run.exit).toBe(2);
		const envelope = errorEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("cannot mix an embedded current_prep payload key with --current-prep-reference");
	});

	test("rejects a missing reference file", async () => {
		const dir = await makeTempDir();
		const prepPath = join(dir, "current-prep.json");
		await writeFile(prepPath, JSON.stringify(referencedCurrentPrep()), "utf8");

		const run = runDiffWithArgs(["--stack-plan-reference", join(dir, "missing.json"), "--current-prep-reference", prepPath]);

		expect(await run.exit).toBe(2);
		const envelope = errorEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("must point to an existing file");
	});

	test("rejects malformed reference JSON", async () => {
		const dir = await makeTempDir();
		const planPath = join(dir, "stack-plan.json");
		const prepPath = join(dir, "current-prep.json");
		await writeFile(planPath, "{", "utf8");
		await writeFile(prepPath, JSON.stringify(referencedCurrentPrep()), "utf8");

		const run = runDiffWithArgs(["--stack-plan-reference", planPath, "--current-prep-reference", prepPath]);

		expect(await run.exit).toBe(2);
		expect(errorEnvelope(run).error_type).toBe("invalid_json");
	});

	test("lets downstream validators diagnose reference artifacts with the wrong shape", async () => {
		const dir = await makeTempDir();
		const planPath = join(dir, "stack-plan.json");
		const prepPath = join(dir, "current-prep.json");
		await writeFile(planPath, JSON.stringify(stackPlan({ threadId: "PRRT_1" })), "utf8");
		await writeFile(prepPath, JSON.stringify(referencedCurrentPrep()), "utf8");

		const planAsPrep = runDiffWithArgs(["--stack-plan-reference", prepPath, "--current-prep-reference", prepPath]);
		expect(await planAsPrep.exit).toBe(1);
		expect(parseDiffEnvelope(planAsPrep.stdout.join("")).data.errors.map((error) => error.code)).toContain("invalid_stack_plan_shape");

		const prepAsPlan = runDiffWithArgs(["--stack-plan-reference", planPath, "--current-prep-reference", planPath]);
		expect(await prepAsPlan.exit).toBe(1);
		expect(parseDiffEnvelope(prepAsPlan.stdout.join("")).data.errors.map((error) => error.code)).toContain("missing_current_pr");
	});
});

function parseDiffEnvelope(text: string): DiffEnvelope {
	return JSON.parse(text) as DiffEnvelope;
}

function stackPlan(options: { threadId: string }): {
	valid: boolean;
	pr_count: number;
	validation: { all_valid: boolean; per_pr: Array<{ pr_number: number; valid: boolean; counts: Record<string, never>; errors: never[] }> };
	batches: Array<{ batch_id: string; complexity: string; approval_required: boolean; items: Array<Record<string, unknown>> }>;
	informational: Array<Record<string, unknown>>;
} {
	return {
		valid: true,
		pr_count: 1,
		validation: { all_valid: true, per_pr: [{ pr_number: 42, valid: true, counts: {}, errors: [] }] },
		batches: [
			{
				batch_id: "local",
				complexity: "local",
				approval_required: false,
				items: [
					{
						pr_number: 42,
						branch: "feature",
						title: "Feature",
						url: "https://example.com/pr/42",
						source_batch_id: "local",
						source_kind: "review_thread",
						summary: "Fix the helper.",
						thread_id: options.threadId,
						path: "file.ts",
						line: 10,
						start_line: null,
						is_outdated: false,
					},
				],
			},
		],
		informational: [],
	};
}

function currentPrep(options: { shouldIncludeResolved: boolean; prNumber?: number | undefined; threads: Array<Record<string, unknown>> }): Record<string, unknown> {
	return {
		payload_session_id: "session",
		include_resolved: options.shouldIncludeResolved,
		stack: [
			{
				pr_number: options.prNumber ?? 42,
				branch: "feature",
				title: "Feature",
				url: "https://example.com/pr/42",
				manifest: { review_threads: options.threads },
			},
		],
	};
}

function thread(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { thread_id: "PRRT_1", path: "file.ts", line: 10, start_line: null, is_resolved: false, is_outdated: false, comment_count: 1, ...overrides };
}
