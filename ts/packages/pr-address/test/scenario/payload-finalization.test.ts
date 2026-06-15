import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { PayloadStore, type PayloadResult } from "../../src/payload-store.ts";
import { prArtifactDescriptor, prBatchArtifactDescriptor } from "../../src/session-artifacts.ts";
import { GOLDEN_V1_ROOT, REPO_ROOT } from "../support/golden.ts";
import { runScenario } from "../support/run-scenario.ts";
import { InMemoryPrAddressGitGateway } from "../support/in-memory-pr-address-gateways.ts";
import { useTempDirs } from "../support/temp.ts";

const makeTempDir = useTempDirs();

function expectOk<T>(result: PayloadResult<T>): T {
	if (result.type !== "ok") throw new Error(`expected ok payload result, got ${result.errorType}: ${result.message}`);
	return result.value;
}

async function seedBuildInputs(root: string, sessionId: string): Promise<{ prNumber: number; batchId: string; commitSha: string | null; decisionsPath: string }> {
	const input = JSON.parse(await readFile(join(GOLDEN_V1_ROOT, "build-resolve-thread-batch-payload/valid-fixed-batch-commit-sha/input.json"), "utf8")) as {
		plan: { pr_number: number };
		batch_id: string;
		commit_sha: string | null;
		decisions: unknown[];
	};
	const store = expectOk(await PayloadStore.open({ root, sessionId }));
	expectOk(await store.writeJsonArtifact({ descriptor: prArtifactDescriptor({ prNumber: input.plan.pr_number, kind: "plan" }), role: "summary", payload: input.plan }));
	const decisionsPath = join(await makeTempDir("pr-address-decisions-"), "decisions.json");
	await writeFile(decisionsPath, JSON.stringify(input.decisions), "utf8");
	return { prNumber: input.plan.pr_number, batchId: input.batch_id, commitSha: input.commit_sha, decisionsPath };
}

async function seedFinalizeInputs(root: string, sessionId: string): Promise<number> {
	const input = JSON.parse(await readFile(join(GOLDEN_V1_ROOT, "finalize-run/all-feedback-addressed/input.json"), "utf8")) as {
		feedback: { pr_number: number };
		checkpoints: Array<{ pr_number: number | null; batch_id: string }>;
	};
	const store = expectOk(await PayloadStore.open({ root, sessionId }));
	expectOk(await store.writeJsonArtifact({ descriptor: prArtifactDescriptor({ prNumber: input.feedback.pr_number, kind: "manifest" }), role: "summary", payload: input.feedback }));
	for (const checkpoint of input.checkpoints) {
		expectOk(
			await store.writeJsonArtifact({
				descriptor: prBatchArtifactDescriptor({ prNumber: input.feedback.pr_number, batchId: checkpoint.batch_id, kind: "checkpoint" }),
				role: "summary",
				payload: { artifact_kind: "checkpoint", ...checkpoint, pr_number: checkpoint.pr_number ?? input.feedback.pr_number, checkpoint_reference: null },
			}),
		);
	}
	return input.feedback.pr_number;
}

describe("managed payload/finalization CLI operations", () => {
	test("build-resolve-thread-batch-payload resolves session plan and writes a build reference", async () => {
		const root = join(await makeTempDir("pr-address-payload-finalization-"), "payload-root");
		const seeded = await seedBuildInputs(root, "build-session");
		const buildRun = runScenario(["exec", "build-resolve-thread-batch-payload", "--pr-number", String(seeded.prNumber), "--batch-id", seeded.batchId, "--commit-sha", String(seeded.commitSha), "--decisions-file", seeded.decisionsPath, "--format", "json"], {
			cwd: REPO_ROOT,
			env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "build-session" },
		});

		expect(await buildRun.exit).toBe(0);
		const data = JSON.parse(buildRun.stdout.join("")).data;
		expect(data.payload_ready).toBe(true);
		expect(data.resolved_inputs.plan.descriptor).toContain("-plan");
		expect(data.build_reference.descriptor).toContain("-resolve-build");
	});

	test("finalize-run resolves final feedback manifest and checkpoint artifacts from the session", async () => {
		const root = join(await makeTempDir("pr-address-payload-finalization-"), "payload-root");
		const prNumber = await seedFinalizeInputs(root, "finalize-session");
		const finalizeRunResult = runScenario(["exec", "finalize-run", "--pr-number", String(prNumber), "--format", "json"], {
			cwd: REPO_ROOT,
			env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "finalize-session" },
		});

		expect(await finalizeRunResult.exit).toBe(0);
		const data = JSON.parse(finalizeRunResult.stdout.join("")).data;
		expect(data.ready_to_stop).toBe(true);
		expect(data.resolved_inputs.feedback.descriptor).toBe(`pr-address-pr-${prNumber}-manifest`);
		expect(data.resolved_inputs.checkpoints.length).toBeGreaterThan(0);
	});

	test("record-batch-checkpoint resolves session artifacts and derives changed files from git", async () => {
		const fixture = JSON.parse(await readFile(new URL("../fixtures/payload-operations/record-batch-checkpoint.json", import.meta.url), "utf8")) as {
			cases: Array<{ name: string; input_json_template: string }>;
		};
		const checkpointCase = fixture.cases.find((candidate) => candidate.name === "complete-thread-batch-success");
		if (checkpointCase === undefined) throw new Error("missing checkpoint fixture case");
		const root = join(await makeTempDir("pr-address-checkpoint-"), "payload-root");
		const input = JSON.parse(checkpointCase.input_json_template.replaceAll("{ROOT}", root)) as {
			plan: { pr_number: number };
			batch_id: string;
			commit_sha: string;
			changed_files: string[];
			validation_commands: unknown[];
			thread_payload_build: unknown;
			thread_resolution_result: unknown;
			non_thread_outcomes: unknown[];
		};
		const store = expectOk(await PayloadStore.open({ root, sessionId: "checkpoint-session" }));
		const planReference = expectOk(await store.writeJsonArtifact({ descriptor: prArtifactDescriptor({ prNumber: input.plan.pr_number, kind: "plan" }), role: "summary", payload: input.plan }));
		const buildReference = expectOk(
			await store.writeJsonArtifact({
				descriptor: prBatchArtifactDescriptor({ prNumber: input.plan.pr_number, batchId: input.batch_id, kind: "resolve-build" }),
				role: "summary",
				payload: { artifact_kind: "resolve_build", pr_number: input.plan.pr_number, batch_id: input.batch_id, source_plan: planReference, build: input.thread_payload_build },
			}),
		);
		expectOk(
			await store.writeJsonArtifact({
				descriptor: prBatchArtifactDescriptor({ prNumber: input.plan.pr_number, batchId: input.batch_id, kind: "thread-resolution" }),
				role: "summary",
				payload: { artifact_kind: "thread_resolution", pr_number: input.plan.pr_number, batch_id: input.batch_id, source_build: buildReference, result: input.thread_resolution_result },
			}),
		);
		const validationPath = join(await makeTempDir("pr-address-validation-"), "validation.json");
		await writeFile(validationPath, JSON.stringify(input.validation_commands), "utf8");
		const git = new InMemoryPrAddressGitGateway({ commitChangedFiles: { [input.commit_sha]: input.changed_files } });

		const run = runScenario(["exec", "record-batch-checkpoint", "--pr-number", String(input.plan.pr_number), "--batch-id", input.batch_id, "--commit-sha", input.commit_sha, "--validation-file", validationPath, "--non-thread-outcomes-json", JSON.stringify(input.non_thread_outcomes ?? []), "--format", "json"], {
			cwd: REPO_ROOT,
			git,
			env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "checkpoint-session" },
		});

		expect(await run.exit).toBe(0);
		const data = JSON.parse(run.stdout.join("")).data;
		expect(data.batch_complete).toBe(true);
		expect(data.changed_files).toEqual(input.changed_files);
		expect(data.resolved_inputs.resolve_build.descriptor).toContain("resolve-build");
		expect(data.checkpoint_reference.descriptor).toContain("checkpoint");
	});

	test("old build/finalize composed payload options are removed", async () => {
		const buildPayload = await readFile(join(GOLDEN_V1_ROOT, "build-resolve-thread-batch-payload/valid-fixed-batch-commit-sha/input.json"), "utf8");
		const buildRun = runScenario(["exec", "build-resolve-thread-batch-payload", "--payload-json", buildPayload, "--format", "json"], { cwd: REPO_ROOT });
		expect(await buildRun.exit).toBe(2);
		expect(buildRun.stdout.join("")).toBe("");
		expect(buildRun.stderr.join("")).toContain("unknown option '--payload-json'");

		const finalizePayload = await readFile(join(GOLDEN_V1_ROOT, "finalize-run/all-feedback-addressed/input.json"), "utf8");
		const finalizeRunResult = runScenario(["exec", "finalize-run", "--payload-json", finalizePayload, "--format", "json"], { cwd: REPO_ROOT });
		expect(await finalizeRunResult.exit).toBe(2);
		expect(finalizeRunResult.stdout.join("")).toBe("");
		expect(finalizeRunResult.stderr.join("")).toContain("unknown option '--payload-json'");
	});
});
