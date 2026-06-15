import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { PayloadStore, type PayloadResult } from "../../src/payload-store.ts";
import { stackArtifactDescriptor } from "../../src/session-artifacts.ts";
import { runScenario } from "../support/run-scenario.ts";
import { useTempDirs } from "../support/temp.ts";

interface BuildStackResolveThreadPayloadsCase {
	name: string;
	payload_json_template: string;
	expected_exit_code: number;
	expected_envelope_text: string;
}

interface BuildStackResolveThreadPayloadsFixture {
	cases: BuildStackResolveThreadPayloadsCase[];
}

const fixture = JSON.parse(
	await readFile(new URL("../fixtures/stack-orchestration/build-stack-resolve-thread-payloads.json", import.meta.url), "utf8"),
) as BuildStackResolveThreadPayloadsFixture;

const makeScopedTempDir = useTempDirs();

function expectOk<T>(result: PayloadResult<T>): T {
	if (result.type !== "ok") throw new Error(`expected ok payload result, got ${result.errorType}: ${result.message}`);
	return result.value;
}

function requiredCase(name: string): BuildStackResolveThreadPayloadsCase {
	const fixtureCase = fixture.cases.find((candidate) => candidate.name === name);
	if (fixtureCase === undefined) throw new Error(`Missing build-stack-resolve-thread-payloads fixture case: ${name}`);
	return fixtureCase;
}

async function seedStackPlanAndDecisions(caseName: string): Promise<{ root: string; decisionsPath: string; batchId: string; commitSha: string | null }> {
	const root = join(await makeScopedTempDir("pr-address-stack-resolve-"), "payload-root");
	const payload = JSON.parse(requiredCase(caseName).payload_json_template) as { stack_plan: unknown; batch_id: string; commit_sha: string | null; decisions: unknown[] };
	const store = expectOk(await PayloadStore.open({ root, sessionId: "stack-session" }));
	expectOk(await store.writeJsonArtifact({ descriptor: stackArtifactDescriptor("plan"), role: "summary", payload: payload.stack_plan }));
	const decisionsPath = join(await makeScopedTempDir("pr-address-stack-decisions-"), "decisions.json");
	await writeFile(decisionsPath, JSON.stringify(payload.decisions), "utf8");
	return { root, decisionsPath, batchId: payload.batch_id, commitSha: payload.commit_sha };
}

describe("build-stack-resolve-thread-payloads session-native flow", () => {
	test("resolves latest stack plan and writes one PR-scoped build artifact per PR entry", async () => {
		const seeded = await seedStackPlanAndDecisions("multi-pr-resolve");
		const run = runScenario(["exec", "build-stack-resolve-thread-payloads", "--batch-id", seeded.batchId, "--commit-sha", String(seeded.commitSha), "--decisions-file", seeded.decisionsPath, "--format", "json"], {
			env: { ASDL_PAYLOAD_ROOT: seeded.root, HARNESS_SESSION_ID: "stack-session" },
		});

		expect(await run.exit).toBe(0);
		const envelope = JSON.parse(run.stdout.join(""));
		expect(envelope.data.valid).toBe(true);
		expect(envelope.data.resolved_inputs.stack_plan.descriptor).toBe("pr-address-stack-plan");
		expect(envelope.data.build_references.length).toBe(envelope.data.payloads.length);
		expect(envelope.data.build_references.every((reference: { descriptor: string }) => reference.descriptor.includes("-resolve-build"))).toBe(true);
		const files = await readdir(join(seeded.root, "sessions", "stack-session", "payloads"));
		expect(files.filter((file) => file.includes("resolve-build.summary.json")).length).toBe(envelope.data.payloads.length);
	});

	test("invalid decisions return a negative result without writing build artifacts", async () => {
		const seeded = await seedStackPlanAndDecisions("duplicate-decision");
		const run = runScenario(["exec", "build-stack-resolve-thread-payloads", "--batch-id", seeded.batchId, "--decisions-file", seeded.decisionsPath, "--format", "json"], {
			env: { ASDL_PAYLOAD_ROOT: seeded.root, HARNESS_SESSION_ID: "stack-session" },
		});

		expect(await run.exit).toBe(1);
		const envelope = JSON.parse(run.stdout.join(""));
		expect(envelope.data.valid).toBe(false);
		expect(envelope.data.build_references).toEqual([]);
	});

	test("old composed payload and stack-plan-reference options are removed", async () => {
		const oldPayload = requiredCase("multi-pr-resolve").payload_json_template;
		const payloadRun = runScenario(["exec", "build-stack-resolve-thread-payloads", "--payload-json", oldPayload, "--format", "json"]);
		expect(await payloadRun.exit).toBe(2);
		expect(payloadRun.stdout.join("")).toBe("");
		expect(payloadRun.stderr.join("")).toContain("unknown option '--payload-json'");

		const referenceRun = runScenario(["exec", "build-stack-resolve-thread-payloads", "--stack-plan-reference", "/tmp/plan.json", "--format", "json"]);
		expect(await referenceRun.exit).toBe(2);
		expect(referenceRun.stdout.join("")).toBe("");
		expect(referenceRun.stderr.join("")).toContain("unknown option '--stack-plan-reference'");
	});

	test("serves --json-schema from TypeScript without invoking the legacy CLI", async () => {
		const run = runScenario(["exec", "build-stack-resolve-thread-payloads", "--json-schema"]);

		expect(await run.exit).toBe(0);
		const document = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
		expect(Object.keys(document).sort()).toEqual(["input_json_schema", "output_json_schema"]);
	});
});
