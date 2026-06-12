import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { recordBatchCheckpoint } from "../../src/batch-checkpoint.ts";
import { runCli, type CliDeps } from "../../src/cli.ts";
import { finalizeRun } from "../../src/finalization.ts";
import { buildGetFeedbackPayloadManifest, buildPrepareRunPayloadManifest } from "../../src/payload-manifest.ts";
import { buildResolveThreadBatchPayload } from "../../src/resolve-thread-batch-payload.ts";

const GOLDEN_ROOT = fileURLToPath(new URL("../fixtures/golden/v1", import.meta.url));
const tempDirs: string[] = [];

interface GoldenCase {
	name: string;
	inputPath: string;
	expectedPath: string;
}

const getFeedbackPayloadManifestCases = await goldenCases("get-feedback-payload-manifest");
const prepareRunPayloadManifestCases = await goldenCases("prepare-run-payload-manifest");
const buildResolveThreadBatchPayloadCases = await goldenCases("build-resolve-thread-batch-payload");
const recordBatchCheckpointCases = await goldenCases("record-batch-checkpoint");
const finalizeRunCases = await goldenCases("finalize-run");

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function goldenCases(operation: string): Promise<GoldenCase[]> {
	const operationDir = join(GOLDEN_ROOT, operation);
	const entries = await readdir(operationDir, { withFileTypes: true });
	const cases = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => ({
			name: entry.name,
			inputPath: join(operationDir, entry.name, "input.json"),
			expectedPath: join(operationDir, entry.name, "expected.json"),
		}));
	cases.sort((left: GoldenCase, right: GoldenCase) => left.name.localeCompare(right.name));
	return cases;
}

async function readJson(path: string): Promise<unknown> {
	return JSON.parse(await readFile(path, "utf8"));
}

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "pr-address-payload-finalization-"));
	tempDirs.push(dir);
	return dir;
}

function runManaged(args: readonly string[], deps: Pick<CliDeps, "stdin"> = {}) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		exit: runCli(args, {
			context: {},
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			stdin: deps.stdin,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
	};
}

describe("payload manifest TypeScript parity", () => {
	for (const goldenCase of getFeedbackPayloadManifestCases) {
		test(`get-feedback payload manifest matches golden ${goldenCase.name}`, async () => {
			const input = await readJson(goldenCase.inputPath);
			const expected = await readJson(goldenCase.expectedPath);

			expect(buildGetFeedbackPayloadManifest(input)).toEqual(expected);
		});
	}

	for (const goldenCase of prepareRunPayloadManifestCases) {
		test(`prepare-run payload manifest matches golden ${goldenCase.name}`, async () => {
			const input = await readJson(goldenCase.inputPath);
			const expected = await readJson(goldenCase.expectedPath);

			expect(buildPrepareRunPayloadManifest(input)).toEqual(expected);
		});
	}
});

describe("resolve-thread batch payload TypeScript parity", () => {
	for (const goldenCase of buildResolveThreadBatchPayloadCases) {
		test(`matches golden ${goldenCase.name}`, async () => {
			const input = await readJson(goldenCase.inputPath);
			const expected = await readJson(goldenCase.expectedPath);

			expect(buildResolveThreadBatchPayload(input)).toEqual(expected);
		});
	}
});

describe("batch checkpoint TypeScript helper parity", () => {
	for (const goldenCase of recordBatchCheckpointCases) {
		test(`matches golden ${goldenCase.name}`, async () => {
			const input = await readJson(goldenCase.inputPath);
			const expected = await readJson(goldenCase.expectedPath);

			expect(recordBatchCheckpoint(input)).toEqual(expected);
		});
	}
});

describe("finalize-run TypeScript parity", () => {
	for (const goldenCase of finalizeRunCases) {
		test(`matches golden ${goldenCase.name}`, async () => {
			const input = await readJson(goldenCase.inputPath);
			const expected = await readJson(goldenCase.expectedPath);

			expect(finalizeRun(input)).toEqual(expected);
		});
	}
});

describe("managed payload/finalization CLI operations", () => {
	test("build-resolve-thread-batch-payload and finalize-run run natively", async () => {
		const buildPayload = await readFile(join(GOLDEN_ROOT, "build-resolve-thread-batch-payload/valid-fixed-batch-commit-sha/input.json"), "utf8");
		const buildRun = runManaged(["exec", "build-resolve-thread-batch-payload", "--payload-json", buildPayload, "--format", "json"]);
		expect(await buildRun.exit).toBe(0);
		expect(JSON.parse(buildRun.stdout.join("")).data.payload_ready).toBe(true);

		const finalizePayload = await readFile(join(GOLDEN_ROOT, "finalize-run/all-feedback-addressed/input.json"), "utf8");
		const finalizeRunResult = runManaged(["exec", "finalize-run", "--payload-json", finalizePayload, "--format", "json"]);
		expect(await finalizeRunResult.exit).toBe(0);
		expect(JSON.parse(finalizeRunResult.stdout.join("")).data.ready_to_stop).toBe(true);
	});

	test("build-resolve-thread-batch-payload accepts --payload-file and rejects mixed payload sources", async () => {
		const buildPayload = await readFile(join(GOLDEN_ROOT, "build-resolve-thread-batch-payload/valid-fixed-batch-commit-sha/input.json"), "utf8");
		const tempDir = await makeTempDir();
		const payloadPath = join(tempDir, "build-payload.json");
		await writeFile(payloadPath, buildPayload, "utf8");

		const fileRun = runManaged(["exec", "build-resolve-thread-batch-payload", "--payload-file", payloadPath, "--format", "json"]);
		expect(await fileRun.exit).toBe(0);
		expect(JSON.parse(fileRun.stdout.join("")).data.payload_ready).toBe(true);

		const conflictRun = runManaged(["exec", "build-resolve-thread-batch-payload", "--payload-json", buildPayload, "--payload-file", payloadPath, "--format", "json"]);
		expect(await conflictRun.exit).toBe(2);
		const conflictEnvelope = JSON.parse(conflictRun.stdout.join(""));
		expect(conflictEnvelope.error_type).toBe("invalid_request");
		expect(conflictEnvelope.message).toContain("--payload-file");
	});

	test("read-feedback-detail reads allowed raw payload pointers natively", async () => {
		const tempDir = await makeTempDir();
		const payloadPath = join(tempDir, "20260603t123456z-0001-feedback.raw.json");
		await writeFile(
			payloadPath,
			JSON.stringify({ exit_code: 0, data: { reviews: [{ id: "R1", body: "Body text" }], review_threads: [], discussion_comments: [] } }),
			"utf8",
		);

		const run = runManaged(["exec", "read-feedback-detail", "--payload-path", payloadPath, "--json-pointer", "/data/reviews/0/body", "--format", "json"]);

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join("")).data).toEqual({
			payload_path: payloadPath,
			json_pointer: "/data/reviews/0/body",
			detail_kind: "review_body",
			value: "Body text",
		});
	});
});
