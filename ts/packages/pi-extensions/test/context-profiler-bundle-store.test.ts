import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";

import { buildBundleSnapshot } from "../src/context-profiler/bundle.ts";
import { createFsBundleStore } from "../src/context-profiler/bundle-store.ts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "ctx-bundle-store-"));
	roots.push(root);
	return root;
}

function snapshot(content: string) {
	const result = buildBundleSnapshot({
		messages: [{ role: "user", content }],
		systemPrompt: "system",
		promptOptions: null,
		sessionId: "sid",
		cwd: "/repo",
		model: "p/m",
		usage: undefined,
		liveSource: "context-event",
		capturedAt: new Date("2026-01-02T03:04:05.000Z"),
	});
	if (!result.ok) throw new Error("snapshot failed");
	return result.value;
}

describe("fs bundle store", () => {
	test("allocates ordinals and reuses only the latest matching hash", async () => {
		const root = await tempRoot();
		const store = createFsBundleStore({ sessionDir: root, sessionId: "sid" });

		const first = await store.persistBundle(snapshot("one"));
		const duplicate = await store.persistBundle(snapshot("one"));
		const second = await store.persistBundle(snapshot("two"));

		expect(first.ok && first.value).toMatchObject({ ordinal: 1, isReused: false, manifest: { sessionId: "sid", model: "p/m", turnCount: 1 } });
		expect(duplicate.ok && duplicate.value).toMatchObject({ ordinal: 1, isReused: true });
		expect(second.ok && second.value).toMatchObject({ ordinal: 2, isReused: false });
	});

	test("invalid manifest directories still reserve ordinals but do not dedupe", async () => {
		const root = await tempRoot();
		await mkdir(join(root, "context-profiles", "sid", "1"), { recursive: true });
		await writeFile(join(root, "context-profiles", "sid", "1", "manifest.json"), "not json", "utf8");
		const store = createFsBundleStore({ sessionDir: root, sessionId: "sid" });

		const result = await store.persistBundle(snapshot("one"));

		expect(result.ok && result.value.ordinal).toBe(2);
	});

	test("episodes writes are exactly once", async () => {
		const root = await tempRoot();
		const store = createFsBundleStore({ sessionDir: root, sessionId: "sid" });
		const persisted = await store.persistBundle(snapshot("one"));
		if (!persisted.ok) throw new Error(persisted.error.message);

		const first = await store.writeEpisodesFile({ bundleDir: persisted.value.dir, json: "{}\n" });
		const second = await store.writeEpisodesFile({ bundleDir: persisted.value.dir, json: "{\"different\":true}\n" });

		expect(first).toEqual({ ok: true, isAlreadyPresent: false });
		expect(second).toEqual({ ok: true, isAlreadyPresent: true });
	});
});
