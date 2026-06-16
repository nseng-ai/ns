import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";
import { z } from "zod";

import { PayloadStore, type PayloadClock, type PayloadResult } from "../../src/payload-store.ts";
import { prArtifactDescriptor, prBatchArtifactDescriptor, resolveLatestJsonSessionArtifact } from "../../src/session-artifacts.ts";
import { useTempDirs } from "../support/temp.ts";

const makeTempDir = useTempDirs();

function expectOk<T>(result: PayloadResult<T>): T {
	if (result.type !== "ok") throw new Error(`expected ok result, got ${result.errorType}: ${result.message}`);
	return result.value;
}

function expectError<T>(result: PayloadResult<T>): { errorType: string; message: string } {
	if (result.type !== "error") throw new Error("expected error result, got ok");
	return { errorType: result.errorType, message: result.message };
}

function sequenceClock(isoValues: readonly string[]): PayloadClock {
	const remaining = [...isoValues];
	return () => {
		const next = remaining.shift();
		if (next === undefined) throw new Error("test clock exhausted");
		return new Date(next);
	};
}

describe("session artifact descriptors", () => {
	test("builds the reserved scope-first descriptor taxonomy", () => {
		expect(prArtifactDescriptor({ prNumber: 1427, kind: "feedback" })).toBe("pr-address-pr-1427-feedback");
		expect(prArtifactDescriptor({ prNumber: 1427, kind: "manifest" })).toBe("pr-address-pr-1427-manifest");
		expect(prArtifactDescriptor({ prNumber: 1427, kind: "classification" })).toBe("pr-address-pr-1427-classification");
		expect(prArtifactDescriptor({ prNumber: 1427, kind: "plan" })).toBe("pr-address-pr-1427-plan");
		expect(prBatchArtifactDescriptor({ prNumber: 1427, batchId: "batch-1", kind: "resolve-build" })).toBe("pr-address-pr-1427-batch-batch-1-resolve-build");
		expect(prBatchArtifactDescriptor({ prNumber: 1427, batchId: "batch-1", kind: "resolution" })).toBe("pr-address-pr-1427-batch-batch-1-resolution");
		expect(prBatchArtifactDescriptor({ prNumber: 1427, batchId: "batch-1", kind: "checkpoint" })).toBe("pr-address-pr-1427-batch-batch-1-checkpoint");
	});

	test("rejects invalid PR numbers loudly", () => {
		expect(() => prArtifactDescriptor({ prNumber: 0, kind: "feedback" })).toThrow("PR number must be a positive integer");
		expect(() => prArtifactDescriptor({ prNumber: 1.5, kind: "feedback" })).toThrow("PR number must be a positive integer");
		expect(() => prBatchArtifactDescriptor({ prNumber: 1427, batchId: "Unsafe Batch", kind: "resolve-build" })).toThrow("Batch id must be a safe segment");
	});
});

describe("latest session artifact resolution", () => {
	test("picks the highest sequence among exact descriptor/role/json matches", async () => {
		const root = join(await makeTempDir("pr-address-session-artifacts-"), "payload-root");
		const descriptor = prArtifactDescriptor({ prNumber: 1427, kind: "manifest" });
		const store = expectOk(
			await PayloadStore.open({
				root,
				sessionId: "sess-1",
				clock: sequenceClock([
					"2026-06-03T12:00:00Z",
					"2026-06-03T12:00:01Z",
					"2026-06-03T12:00:02Z",
					"2026-06-03T12:00:03Z",
					"2026-06-03T12:00:04Z",
				]),
			}),
		);
		expectOk(await store.writeJsonArtifact({ descriptor, role: "summary", payload: { value: 1 } }));
		expectOk(await store.writeJsonArtifact({ descriptor, role: "raw", payload: { value: "wrong-role" } }));
		expectOk(await store.writeTextArtifact({ descriptor, role: "log", text: "wrong-extension\n" }));
		expectOk(await store.writeJsonArtifact({ descriptor: prArtifactDescriptor({ prNumber: 1427, kind: "classification" }), role: "summary", payload: { value: "wrong-descriptor" } }));
		expectOk(await store.writeJsonArtifact({ descriptor, role: "summary", payload: { value: 2 } }));
		await writeFile(join(store.payloadDir, "not-a-payload.json"), "{}", "utf8");

		const resolved = expectOk(await resolveLatestJsonSessionArtifact({ store, descriptor, role: "summary", schema: z.object({ value: z.number() }) }));

		expect(resolved.value).toEqual({ value: 2 });
		expect(resolved.reference).toMatchObject({
			session_id: "sess-1",
			descriptor,
			role: "summary",
			sequence: 5,
			content_type: "application/json",
			extension: "json",
			created_at_utc: "2026-06-03T12:00:04Z",
		});
		expect(resolved.reference.payload_path).toBe(join(store.payloadDir, "20260603t120004z-0005-pr-address-pr-1427-manifest.summary.json"));
		expect(resolved.reference.payload_bytes).toBeGreaterThan(0);
	});

	test("reports missing and schema-mismatched artifacts as payload lookup failures", async () => {
		const root = join(await makeTempDir("pr-address-session-artifacts-"), "payload-root");
		const store = expectOk(await PayloadStore.open({ root, sessionId: "sess-1", clock: sequenceClock(["2026-06-03T12:00:00Z"]) }));
		const descriptor = prArtifactDescriptor({ prNumber: 1427, kind: "manifest" });

		const missing = expectError(await resolveLatestJsonSessionArtifact({ store, descriptor, role: "summary" }));
		expect(missing.errorType).toBe("payload_lookup_failed");
		expect(missing.message).toContain(descriptor);
		expect(missing.message).toContain("role summary");
		expect(missing.message).toContain("session sess-1");

		expectOk(await store.writeJsonArtifact({ descriptor, role: "summary", payload: { value: "not-number" } }));
		const schemaMismatch = expectError(await resolveLatestJsonSessionArtifact({ store, descriptor, role: "summary", schema: z.object({ value: z.number() }) }));
		expect(schemaMismatch.errorType).toBe("payload_lookup_failed");
		expect(schemaMismatch.message).toContain("failed schema validation");
	});
});
