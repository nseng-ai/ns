import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { GOLDEN_V1_ROOT, REPO_ROOT } from "../support/golden.ts";
import { runScenario } from "../support/run-scenario.ts";
import { useTempDirs } from "../support/temp.ts";

const makeTempDir = useTempDirs();

describe("managed payload/finalization CLI operations", () => {
	test("build-resolve-thread-batch-payload and finalize-run run without legacy fallback", async () => {
		const buildPayload = await readFile(join(GOLDEN_V1_ROOT, "build-resolve-thread-batch-payload/valid-fixed-batch-commit-sha/input.json"), "utf8");
		const buildRun = runScenario(["exec", "build-resolve-thread-batch-payload", "--payload-json", buildPayload, "--format", "json"], { cwd: REPO_ROOT });
		expect(await buildRun.exit).toBe(0);
		expect(JSON.parse(buildRun.stdout.join("")).data.payload_ready).toBe(true);

		const finalizePayload = await readFile(join(GOLDEN_V1_ROOT, "finalize-run/all-feedback-addressed/input.json"), "utf8");
		const finalizeRunResult = runScenario(["exec", "finalize-run", "--payload-json", finalizePayload, "--format", "json"], { cwd: REPO_ROOT });
		expect(await finalizeRunResult.exit).toBe(0);
		expect(JSON.parse(finalizeRunResult.stdout.join("")).data.ready_to_stop).toBe(true);
	});

	test("build-resolve-thread-batch-payload accepts --payload-file and rejects mixed payload sources", async () => {
		const buildPayload = await readFile(join(GOLDEN_V1_ROOT, "build-resolve-thread-batch-payload/valid-fixed-batch-commit-sha/input.json"), "utf8");
		const tempDir = await makeTempDir("pr-address-payload-finalization-");
		const payloadPath = join(tempDir, "build-payload.json");
		await writeFile(payloadPath, buildPayload, "utf8");

		const fileRun = runScenario(["exec", "build-resolve-thread-batch-payload", "--payload-file", payloadPath, "--format", "json"], { cwd: REPO_ROOT });
		expect(await fileRun.exit).toBe(0);
		expect(JSON.parse(fileRun.stdout.join("")).data.payload_ready).toBe(true);

		const conflictRun = runScenario(["exec", "build-resolve-thread-batch-payload", "--payload-json", buildPayload, "--payload-file", payloadPath, "--format", "json"], { cwd: REPO_ROOT });
		expect(await conflictRun.exit).toBe(2);
		const conflictEnvelope = JSON.parse(conflictRun.stdout.join(""));
		expect(conflictEnvelope.error_type).toBe("invalid_request");
		expect(conflictEnvelope.message).toContain("--payload-file");
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
