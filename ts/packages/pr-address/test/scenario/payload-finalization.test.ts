import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { InMemoryPayloadStoreFactory, type PayloadResult } from "../../src/payload-store.ts";
import { prArtifactDescriptor } from "../../src/session-artifacts.ts";
import { GOLDEN_V1_ROOT, REPO_ROOT } from "../support/golden.ts";
import { fixedClock, runScenario } from "../support/run-scenario.ts";
import { useTempDirs } from "../support/temp.ts";

const makeTempDir = useTempDirs();

function expectOk<T>(result: PayloadResult<T>): T {
	if (result.type !== "ok") throw new Error(`expected ok result, got ${result.errorType}: ${result.message}`);
	return result.value;
}

describe("managed payload/finalization CLI operations", () => {
	test("build-resolve-thread-batch-payload resolves the latest PR plan and writes a build artifact", async () => {
		const buildInput = JSON.parse(await readFile(join(GOLDEN_V1_ROOT, "build-resolve-thread-batch-payload/valid-fixed-batch-commit-sha/input.json"), "utf8")) as {
			plan: unknown;
			decisions: unknown;
		};
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

		const finalizePayload = await readFile(join(GOLDEN_V1_ROOT, "finalize-run/all-feedback-addressed/input.json"), "utf8");
		const finalizeRunResult = runScenario(["exec", "finalize-run", "--payload-json", finalizePayload, "--format", "json"], { cwd: REPO_ROOT });
		expect(await finalizeRunResult.exit).toBe(0);
		expect(JSON.parse(finalizeRunResult.stdout.join("")).data.ready_to_stop).toBe(true);
	});

	test("build-resolve-thread-batch-payload no longer accepts composed payload options", async () => {
		const buildPayload = await readFile(join(GOLDEN_V1_ROOT, "build-resolve-thread-batch-payload/valid-fixed-batch-commit-sha/input.json"), "utf8");
		const run = runScenario(["exec", "build-resolve-thread-batch-payload", "--payload-json", buildPayload, "--format", "json"], { cwd: REPO_ROOT });

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

		const run = runScenario(["exec", "read-feedback-detail", "--payload-path", payloadPath, "--json-pointer", "/data/reviews/0/body", "--format", "json"], { cwd: REPO_ROOT });

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join("")).data).toEqual({
			payload_path: payloadPath,
			json_pointer: "/data/reviews/0/body",
			detail_kind: "review_body",
			value: "Body text",
		});
	});
});
