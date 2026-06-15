import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { isRecord } from "@asdl/core";
import { describe, expect, test } from "vitest";

import { InMemoryPayloadStoreFactory } from "../../src/payload-store-memory.ts";
import type { PayloadResult } from "../../src/payload-store.ts";
import { prArtifactDescriptor, prBatchArtifactDescriptor } from "../../src/session-artifacts.ts";
import { GOLDEN_V1_ROOT, REPO_ROOT } from "../support/golden.ts";
import { InMemoryPrAddressGitGateway, InMemoryPrAddressGitHubGateway, reviewThread } from "../support/in-memory-pr-address-gateways.ts";
import { fixedClock, runScenario } from "../support/run-scenario.ts";
import { useTempDirs } from "../support/temp.ts";

const makeTempDir = useTempDirs();

function expectOk<T>(result: PayloadResult<T>): T {
	if (result.type !== "ok") throw new Error(`expected ok result, got ${result.errorType}: ${result.message}`);
	return result.value;
}

async function loadBuildFixture(): Promise<{ plan: Record<string, unknown>; decisions: unknown }> {
	return JSON.parse(await readFile(join(GOLDEN_V1_ROOT, "build-resolve-thread-batch-payload/valid-fixed-batch-commit-sha/input.json"), "utf8")) as {
		plan: Record<string, unknown>;
		decisions: unknown;
	};
}

async function loadPreExistingFixture(): Promise<{ plan: Record<string, unknown>; decisions: unknown }> {
	return JSON.parse(await readFile(join(GOLDEN_V1_ROOT, "build-resolve-thread-batch-payload/valid-pre-existing/input.json"), "utf8")) as {
		plan: Record<string, unknown>;
		decisions: unknown;
	};
}

function planBatches(plan: Record<string, unknown>): Array<Record<string, unknown>> {
	const batches = plan.batches;
	if (!Array.isArray(batches)) return [];
	return batches.filter(isRecord);
}

function batchId(batch: Record<string, unknown>): string | undefined {
	return typeof batch.batch_id === "string" ? batch.batch_id : undefined;
}

describe("managed payload/finalization CLI operations", () => {
	test("build-resolve-thread-batch-payload resolves the latest PR plan and writes a build artifact", async () => {
		const buildInput = await loadBuildFixture();
		const tempDir = await makeTempDir("pr-address-payload-finalization-");
		const decisionsPath = join(tempDir, "decisions.json");
		await writeFile(decisionsPath, JSON.stringify(buildInput.decisions), "utf8");
		const env = { PATH: "/fake/bin", ASDL_PAYLOAD_ROOT: "/payload-root", HARNESS_SESSION_ID: "sess-1" };
		const payloadStoreFactory = new InMemoryPayloadStoreFactory({ clock: fixedClock("2026-06-10T12:00:00Z") });
		const store = expectOk(await payloadStoreFactory.fromEnvironment({ env }));
		expectOk(await store.writeJsonArtifact({ descriptor: prArtifactDescriptor({ prNumber: 42, kind: "plan" }), role: "summary", payload: buildInput.plan }));

		const buildRun = runScenario(
			[
				"exec",
				"build-resolve-thread-batch-payload",
				"--pr-number",
				"42",
				"--batch-id",
				"single_file",
				"--commit-sha",
				"abc123",
				"--decisions-file",
				decisionsPath,
				"--format",
				"json",
				"--stdout-mode",
				"full",
			],
			{ cwd: REPO_ROOT, env, payloadStoreFactory },
		);

		expect(await buildRun.exit).toBe(0);
		const data = JSON.parse(buildRun.stdout.join("")).data;
		expect(data.payload_ready).toBe(true);
		expect(data.resolved_inputs.plan.descriptor).toBe("pr-address-pr-42-plan");
		expect(data.build_reference).toMatchObject({ descriptor: "pr-address-pr-42-batch-single_file-resolve-build", role: "summary", extension: "json" });
		const artifactText = payloadStoreFactory.artifactText(data.build_reference.payload_path);
		expect(artifactText).toBeDefined();
		const artifact = JSON.parse(artifactText ?? "{}");
		expect(artifact).toMatchObject({ artifact_kind: "thread_resolution_build", source: "single_pr", pr_number: 42, batch_id: "single_file", payload_ready: true });
		expect(artifact.payload.items).toEqual([{ thread_id: "T_single", mode: "fixed", message: "Fixed the guard.", commit_sha: null, provenance: null }]);
	});

	test("single-PR lifecycle resolves build, resolution, checkpoint, and finalization artifacts from the session", async () => {
		const buildInput = await loadBuildFixture();
		const tempDir = await makeTempDir("pr-address-payload-finalization-");
		const decisionsPath = join(tempDir, "decisions.json");
		const evidencePath = join(tempDir, "checkpoint-evidence.json");
		await writeFile(decisionsPath, JSON.stringify(buildInput.decisions), "utf8");
		await writeFile(
			evidencePath,
			JSON.stringify({
				validation_commands: [{ command: "pnpm test", status: "passed", exit_code: 0, summary: "ok" }],
				non_thread_outcomes: [{ source_kind: "discussion_comment", discussion_comment_id: 4101, action: "replied", result_comment_id: 9001, summary: "Replied." }],
			}),
			"utf8",
		);
		const env = { PATH: "/fake/bin", ASDL_PAYLOAD_ROOT: "/payload-root", HARNESS_SESSION_ID: "sess-1" };
		const payloadStoreFactory = new InMemoryPayloadStoreFactory({ clock: fixedClock("2026-06-10T12:00:00Z") });
		const store = expectOk(await payloadStoreFactory.fromEnvironment({ env }));
		const plan = { ...buildInput.plan, batches: planBatches(buildInput.plan).filter((batch) => batchId(batch) === "single_file") };
		expectOk(await store.writeJsonArtifact({ descriptor: prArtifactDescriptor({ prNumber: 42, kind: "plan" }), role: "summary", payload: plan }));

		const buildRun = runScenario(
			[
				"exec",
				"build-resolve-thread-batch-payload",
				"--pr-number",
				"42",
				"--batch-id",
				"single_file",
				"--commit-sha",
				"abc123",
				"--decisions-file",
				decisionsPath,
				"--format",
				"json",
				"--stdout-mode",
				"full",
			],
			{ cwd: REPO_ROOT, env, payloadStoreFactory },
		);
		expect(await buildRun.exit).toBe(0);
		const buildReference = JSON.parse(buildRun.stdout.join("")).data.build_reference;

		const github = new InMemoryPrAddressGitHubGateway({ reviewThreads: { 42: [reviewThread({ id: "T_single", is_resolved: true })] } });
		const resolveRun = runScenario(["exec", "resolve-thread-batch", "--from-build", buildReference.payload_path, "--format", "json", "--stdout-mode", "full"], { cwd: REPO_ROOT, env, payloadStoreFactory, github });
		expect(await resolveRun.exit).toBe(0);
		const resolutionData = JSON.parse(resolveRun.stdout.join("")).data;
		expect(resolutionData.resolved_inputs.build.payload_path).toBe(buildReference.payload_path);
		expect(resolutionData.resolution_reference).toMatchObject({ descriptor: "pr-address-pr-42-batch-single_file-resolution", role: "summary" });

		const git = new InMemoryPrAddressGitGateway({ commitChangedFiles: { abc123: ["src/widget.ts"] } });
		const checkpointRun = runScenario(
			[
				"exec",
				"record-batch-checkpoint",
				"--pr-number",
				"42",
				"--batch-id",
				"single_file",
				"--commit-sha",
				"abc123",
				"--evidence-file",
				evidencePath,
				"--format",
				"json",
				"--stdout-mode",
				"full",
			],
			{ cwd: REPO_ROOT, env, payloadStoreFactory, git },
		);
		expect(await checkpointRun.exit, checkpointRun.stdout.join("")).toBe(0);
		const checkpointData = JSON.parse(checkpointRun.stdout.join("")).data;
		expect(checkpointData.changed_files).toEqual(["src/widget.ts"]);
		expect(checkpointData.resolved_inputs).toMatchObject({ plan: { descriptor: "pr-address-pr-42-plan" }, build: { descriptor: "pr-address-pr-42-batch-single_file-resolve-build" }, resolution: { descriptor: "pr-address-pr-42-batch-single_file-resolution" } });
		expect(checkpointData.checkpoint_reference).toMatchObject({ descriptor: "pr-address-pr-42-batch-single_file-checkpoint", role: "summary" });

		const feedbackRun = runScenario(["exec", "get-feedback", "42", "--include-resolved", "--format", "json", "--stdout-mode", "full"], { cwd: REPO_ROOT, env, payloadStoreFactory, github });
		expect(await feedbackRun.exit).toBe(0);

		const finalizeRun = runScenario(["exec", "finalize-run", "--pr-number", "42", "--format", "json", "--stdout-mode", "full"], { cwd: REPO_ROOT, env, payloadStoreFactory });
		expect(await finalizeRun.exit, finalizeRun.stdout.join("")).toBe(0);
		const finalizeData = JSON.parse(finalizeRun.stdout.join("")).data;
		expect(finalizeData.ready_to_stop).toBe(true);
		expect(finalizeData.resolved_inputs).toMatchObject({ plan: { descriptor: "pr-address-pr-42-plan" }, feedback: { descriptor: "pr-address-pr-42-feedback" } });
		expect(finalizeData.resolved_inputs.checkpoints).toHaveLength(1);
	});

	test("record-batch-checkpoint accepts explicit no-code checkpoints without a commit SHA", async () => {
		const input = await loadPreExistingFixture();
		const tempDir = await makeTempDir("pr-address-payload-finalization-");
		const evidencePath = join(tempDir, "checkpoint-evidence.json");
		await writeFile(
			evidencePath,
			JSON.stringify({
				non_thread_outcomes: [{ source_kind: "review", review_id: "R_pre", action: "no_reply_needed", summary: "Already handled by existing work." }],
			}),
			"utf8",
		);
		const env = { PATH: "/fake/bin", ASDL_PAYLOAD_ROOT: "/payload-root", HARNESS_SESSION_ID: "sess-1" };
		const payloadStoreFactory = new InMemoryPayloadStoreFactory({ clock: fixedClock("2026-06-10T12:00:00Z") });
		const store = expectOk(await payloadStoreFactory.fromEnvironment({ env }));
		const plan = { ...input.plan, batches: planBatches(input.plan).filter((batch) => batchId(batch) === "pre_existing") };
		expectOk(await store.writeJsonArtifact({ descriptor: prArtifactDescriptor({ prNumber: 42, kind: "plan" }), role: "summary", payload: plan }));

		const checkpointRun = runScenario(
			[
				"exec",
				"record-batch-checkpoint",
				"--pr-number",
				"42",
				"--batch-id",
				"pre_existing",
				"--no-code-change",
				"--evidence-file",
				evidencePath,
				"--format",
				"json",
				"--stdout-mode",
				"full",
			],
			{ cwd: REPO_ROOT, env, payloadStoreFactory },
		);
		expect(await checkpointRun.exit, checkpointRun.stdout.join("")).toBe(0);
		const checkpointData = JSON.parse(checkpointRun.stdout.join("")).data;
		expect(checkpointData.commit_sha).toBeNull();
		expect(checkpointData.changed_files).toEqual([]);
		expect(checkpointData.checkpoint_reference).toMatchObject({ descriptor: "pr-address-pr-42-batch-pre_existing-checkpoint", role: "summary" });

		const conflictRun = runScenario(
			[
				"exec",
				"record-batch-checkpoint",
				"--pr-number",
				"42",
				"--batch-id",
				"pre_existing",
				"--no-code-change",
				"--commit-sha",
				"abc123",
				"--evidence-file",
				evidencePath,
				"--format",
				"json",
			],
			{ cwd: REPO_ROOT, env, payloadStoreFactory },
		);
		expect(await conflictRun.exit).toBe(2);
		expect(JSON.parse(conflictRun.stdout.join("")).message).toContain("--no-code-change cannot be combined with --commit-sha");
	});

	test("finalize-run reports missing planned-batch checkpoint evidence", async () => {
		const buildInput = await loadBuildFixture();
		const plan = { ...buildInput.plan, batches: [...planBatches(buildInput.plan), { batch_id: "second_batch", complexity: "single_file", approval_required: false, items: [] }] };
		const env = { PATH: "/fake/bin", ASDL_PAYLOAD_ROOT: "/payload-root", HARNESS_SESSION_ID: "sess-1" };
		const payloadStoreFactory = new InMemoryPayloadStoreFactory({ clock: fixedClock("2026-06-10T12:00:00Z") });
		const store = expectOk(await payloadStoreFactory.fromEnvironment({ env }));
		expectOk(await store.writeJsonArtifact({ descriptor: prArtifactDescriptor({ prNumber: 42, kind: "plan" }), role: "summary", payload: plan }));
		expectOk(await store.writeJsonArtifact({ descriptor: prArtifactDescriptor({ prNumber: 42, kind: "feedback" }), role: "raw", payload: { data: { reviews: [], review_threads: [], discussion_comments: [] } } }));

		const run = runScenario(["exec", "finalize-run", "--pr-number", "42", "--format", "json", "--stdout-mode", "full"], { cwd: REPO_ROOT, env, payloadStoreFactory });

		expect(await run.exit).toBe(1);
		const data = JSON.parse(run.stdout.join("")).data;
		expect(data.ready_to_stop).toBe(false);
		expect(data.errors.map((error: { code: string; batch_id: string }) => [error.code, error.batch_id])).toContainEqual(["missing_checkpoint_evidence", "second_batch"]);
	});

	test("lifecycle helpers no longer accept composed payload options", async () => {
		for (const operation of ["record-batch-checkpoint", "finalize-run"]) {
			const run = runScenario(["exec", operation, "--payload-json", "{}", "--format", "json", "--stdout-mode", "full"], { cwd: REPO_ROOT });
			expect(await run.exit, operation).toBe(2);
			expect(run.stdout.join(""), operation).toBe("");
			expect(run.stderr.join(""), operation).toContain("unknown option '--payload-json'");
		}
	});

	test("build-resolve-thread-batch-payload no longer accepts composed payload options", async () => {
		const buildPayload = await readFile(join(GOLDEN_V1_ROOT, "build-resolve-thread-batch-payload/valid-fixed-batch-commit-sha/input.json"), "utf8");
		const run = runScenario(["exec", "build-resolve-thread-batch-payload", "--payload-json", buildPayload, "--format", "json", "--stdout-mode", "full"], { cwd: REPO_ROOT });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("unknown option '--payload-json'");
	});

	test("read-feedback-detail reads allowed raw payload pointers without legacy fallback", async () => {
		const tempDir = await makeTempDir("pr-address-payload-finalization-");
		const payloadPath = join(tempDir, "20260603t123456z-0001-feedback.raw.json");
		await writeFile(
			payloadPath,
			JSON.stringify({ exit_code: 0, data: { reviews: [{ id: "R1", body: "Body text" }], review_threads: [], discussion_comments: [] } }),
			"utf8",
		);

		const run = runScenario(["exec", "read-feedback-detail", "--payload-path", payloadPath, "--json-pointer", "/data/reviews/0/body", "--format", "json", "--stdout-mode", "full"], { cwd: REPO_ROOT });

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join("")).data).toEqual({
			payload_path: payloadPath,
			json_pointer: "/data/reviews/0/body",
			detail_kind: "review_body",
			value: "Body text",
		});
	});
});
