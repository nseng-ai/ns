import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { buildStackResolveThreadPayloads } from "../../src/stack-resolve-thread-payloads.ts";
import { InMemoryPayloadStoreFactory } from "../../src/payload-store-memory.ts";
import type { PayloadResult } from "../../src/payload-store.ts";
import { stackArtifactDescriptor } from "../../src/session-artifacts.ts";
import { fixedClock, runScenario } from "../support/run-scenario.ts";
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
	if (result.type !== "ok") throw new Error(`expected ok result, got ${result.errorType}: ${result.message}`);
	return result.value;
}

async function makeTempDir(): Promise<string> {
	return makeScopedTempDir("pr-address-stack-resolve-");
}

function requiredCase(name: string): BuildStackResolveThreadPayloadsCase {
	const fixtureCase = fixture.cases.find((candidate) => candidate.name === name);
	if (fixtureCase === undefined) throw new Error(`Missing build-stack-resolve-thread-payloads fixture case: ${name}`);
	return fixtureCase;
}

describe("build-stack-resolve-thread-payloads session artifact flow", () => {
	test("resolves the latest stack plan and writes one build artifact per ready PR", async () => {
		const happyCase = requiredCase("multi-pr-resolve");
		const input = JSON.parse(happyCase.payload_json_template) as { stack_plan: unknown; decisions: unknown };
		const dir = await makeTempDir();
		const decisionsPath = join(dir, "decisions.json");
		await writeFile(decisionsPath, JSON.stringify(input.decisions), "utf8");
		const env = { PATH: "/fake/bin", ASDL_PAYLOAD_ROOT: "/payload-root", HARNESS_SESSION_ID: "stack-sess" };
		const payloadStoreFactory = new InMemoryPayloadStoreFactory({ clock: fixedClock("2026-06-10T12:00:00Z") });
		const store = expectOk(await payloadStoreFactory.fromEnvironment({ env }));
		expectOk(await store.writeJsonArtifact({ descriptor: stackArtifactDescriptor("plan"), role: "summary", payload: input.stack_plan }));

		const run = runScenario(
			[
				"exec",
				"build-stack-resolve-thread-payloads",
				"--batch-id",
				"local",
				"--commit-sha",
				"abc123",
				"--decisions-file",
				decisionsPath,
				"--format",
				"json",
				"--stdout-mode",
				"full",
			],
			{ env, payloadStoreFactory },
		);

		expect(await run.exit).toBe(0);
		const data = JSON.parse(run.stdout.join("")).data;
		expect(data.resolved_inputs.plan.descriptor).toBe("pr-address-stack-plan");
		const readyEntries = data.payloads.filter((entry: { payload_ready: boolean }) => entry.payload_ready);
		expect(readyEntries.length).toBeGreaterThan(0);
		for (const entry of readyEntries) {
			expect(entry.build_reference).toMatchObject({
				descriptor: `pr-address-pr-${entry.pr_number}-batch-${entry.batch_id}-resolve-build`,
				role: "summary",
				extension: "json",
			});
			const artifact = JSON.parse(payloadStoreFactory.artifactText(entry.build_reference.payload_path) ?? "{}");
			expect(artifact).toMatchObject({ artifact_kind: "thread_resolution_build", source: "stack", pr_number: entry.pr_number, payload_ready: true });
			expect(artifact.payload).toEqual(entry.payload);
		}
	});

	test("builds explained payloads for only voided_by_stack_work batch threads", () => {
		interface StackPlanItem {
			pr_number: number;
			branch: string;
			title: string | null;
			url: string | null;
			source_batch_id: string | null;
			source_kind: string;
			summary: string;
			action_summary: string | null;
			complexity: string | null;
			approval_required: boolean;
			review_id: string | null;
			review_state: string | null;
			submitted_at: string | null;
			thread_id: string | null;
			discussion_comment_id: number | null;
			covered_comment_ids: number[];
			body_locator: unknown | null;
			thread_item_pointer: string | null;
			path: string | null;
			line: number | null;
			start_line: number | null;
			is_outdated: boolean | null;
			author: string | null;
			needs_reply: boolean | null;
		}
		interface StackPlanBatch {
			batch_id: string;
			complexity: string;
			approval_required: boolean;
			items: StackPlanItem[];
		}
		interface StackPlanFixtureInput {
			stack_plan: { batches: StackPlanBatch[] };
		}
		const happyCase = requiredCase("multi-pr-resolve");
		const input = JSON.parse(happyCase.payload_json_template) as StackPlanFixtureInput;
		const localBatch = input.stack_plan.batches.find((batch) => batch.batch_id === "local");
		const templateItem = localBatch?.items.find((item) => item.thread_id === "PRRT_102");
		if (templateItem === undefined) throw new Error("fixture must include PRRT_102 local thread");
		input.stack_plan.batches.unshift({
			batch_id: "voided_by_stack_work",
			complexity: "voided_by_stack_work",
			approval_required: false,
			items: [
				{
					...templateItem,
					source_batch_id: "voided_by_stack_work",
					thread_id: "PRRT_VOIDED",
					summary: "Lower-stack parser request is obsolete at stack tip.",
					action_summary: "Already addressed by later stack work: both parsing paths use the shared parser.",
					complexity: "voided_by_stack_work",
					approval_required: false,
				},
			],
		});

		const result = buildStackResolveThreadPayloads({
			stack_plan: input.stack_plan,
			batch_id: "voided_by_stack_work",
			commit_sha: null,
			continue_on_error: false,
			decisions: [
				{
					pr_number: 102,
					thread_id: "PRRT_VOIDED",
					action: "resolve",
					mode: "explained",
					message: "Already addressed by later stack work: both parsing paths use the shared parser.",
				},
			],
		});

		expect(result).toMatchObject({ valid: true, batch_id: "voided_by_stack_work", review_thread_count: 1, resolved_thread_count: 1 });
		expect(result.errors).toEqual([]);
		expect(JSON.stringify(result)).not.toContain("missing_thread_decision");
		expect(result.payloads).toHaveLength(1);
		expect(result.payloads[0]?.payload?.items).toEqual([
			expect.objectContaining({
				thread_id: "PRRT_VOIDED",
				mode: "explained",
				message: "Already addressed by later stack work: both parsing paths use the shared parser.",
			}),
		]);
	});

	test("reports invalid_json for malformed decisions files", async () => {
		const happyCase = requiredCase("multi-pr-resolve");
		const input = JSON.parse(happyCase.payload_json_template) as { stack_plan: unknown };
		const dir = await makeTempDir();
		const decisionsPath = join(dir, "decisions.json");
		await writeFile(decisionsPath, "{", "utf8");
		const env = { PATH: "/fake/bin", ASDL_PAYLOAD_ROOT: "/payload-root", HARNESS_SESSION_ID: "stack-sess" };
		const payloadStoreFactory = new InMemoryPayloadStoreFactory({ clock: fixedClock("2026-06-10T12:00:00Z") });
		const store = expectOk(await payloadStoreFactory.fromEnvironment({ env }));
		expectOk(await store.writeJsonArtifact({ descriptor: stackArtifactDescriptor("plan"), role: "summary", payload: input.stack_plan }));

		const run = runScenario(["exec", "build-stack-resolve-thread-payloads", "--batch-id", "local", "--decisions-file", decisionsPath, "--format", "json"], {
			env,
			payloadStoreFactory,
		});

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { error_type: string };
		expect(envelope.error_type).toBe("invalid_json");
	});

	test("rejects old composed-input options with a commander usage error", async () => {
		const happyCase = requiredCase("multi-pr-resolve");
		const run = runScenario(["exec", "build-stack-resolve-thread-payloads", "--payload-json", happyCase.payload_json_template, "--format", "json"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("unknown option '--payload-json'");
	});

	test("rejects unknown options with a commander usage error", async () => {
		const run = runScenario(["exec", "build-stack-resolve-thread-payloads", "--bogus", "--format", "json"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("error: unknown option '--bogus'\n");
	});

	test("serves --json-schema from TypeScript", async () => {
		const run = runScenario(["exec", "build-stack-resolve-thread-payloads", "--json-schema"]);

		expect(await run.exit).toBe(0);
		const document = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
		expect(Object.keys(document).sort()).toEqual(["input_json_schema", "output_json_schema"]);
	});
});
