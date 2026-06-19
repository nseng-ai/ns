import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listBundles, resolveStoreRoot, VibechkError } from "../../src/store.ts";
import { writeTestBundle } from "../support/fixtures.ts";

describe("store", () => {
	describe("resolveStoreRoot", () => {
		it("returns explicit path when provided", () => {
			const explicit = "/explicit/store";
			expect(resolveStoreRoot(explicit, { VIBECHK_HOME: "/env/store" })).toBe(explicit);
		});

		it("returns VIBECHK_HOME when explicit is undefined", () => {
			expect(resolveStoreRoot(undefined, { VIBECHK_HOME: "/env/store" })).toBe("/env/store");
		});

		it("returns XDG_STATE_HOME/vibechk when VIBECHK_HOME is not set", () => {
			expect(resolveStoreRoot(undefined, { XDG_STATE_HOME: "/xdg/state" })).toBe(
				"/xdg/state/vibechk",
			);
		});

		it("returns HOME/.local/state/vibechk when neither VIBECHK_HOME nor XDG_STATE_HOME are set", () => {
			expect(resolveStoreRoot(undefined, { HOME: "/home/user" })).toBe(
				"/home/user/.local/state/vibechk",
			);
		});

		it("throws when HOME is not set and needed", () => {
			expect(() => resolveStoreRoot(undefined, {})).toThrow("HOME environment variable is not set");
		});
	});

	describe("listBundles", () => {
		let storeRoot: string;

		beforeEach(async () => {
			storeRoot = await mkdtemp(join(tmpdir(), "vibechk-test-"));
		});

		afterEach(async () => {
			await rm(storeRoot, { recursive: true, force: true });
		});

		it("sorts bundles newest first with run_id as tie-breaker", async () => {
			const timestamp = new Date("2026-05-23T12:00:00Z");
			await writeTestBundle(storeRoot, {
				runId: "ccccdddd",
				startedAt: new Date(timestamp.getTime() + 3600000), // +1 hour
			});
			await writeTestBundle(storeRoot, {
				runId: "bbbbcccc",
				startedAt: timestamp,
			});
			await writeTestBundle(storeRoot, {
				runId: "aaaabbbb",
				startedAt: timestamp,
			});

			const loaded = await listBundles(storeRoot);

			expect(loaded.map((item) => item.bundle.runId)).toEqual(["ccccdddd", "aaaabbbb", "bbbbcccc"]);
		});

		it("returns empty array for missing store", async () => {
			const missing = join(storeRoot, "missing");
			expect(await listBundles(missing)).toEqual([]);
		});

		it("ignores non-directory children in runs dir", async () => {
			const { writeFile, mkdir } = await import("node:fs/promises");
			await writeTestBundle(storeRoot, { runId: "aaaabbbb" });
			await mkdir(join(storeRoot, "runs"), { recursive: true });
			await writeFile(join(storeRoot, "runs", "notes.txt"), "not a run\n", "utf-8");

			const loaded = await listBundles(storeRoot);
			expect(loaded.map((item) => item.bundle.runId)).toEqual(["aaaabbbb"]);
		});

		it("throws for missing bundle.json", async () => {
			const { mkdir } = await import("node:fs/promises");
			await mkdir(join(storeRoot, "runs", "aaaabbbb"), { recursive: true });

			await expect(listBundles(storeRoot)).rejects.toThrow(VibechkError);
			await expect(listBundles(storeRoot)).rejects.toThrow("is missing bundle.json");
		});

		it("throws for invalid bundle.json", async () => {
			const { mkdir, writeFile } = await import("node:fs/promises");
			const runDir = join(storeRoot, "runs", "aaaabbbb");
			await mkdir(runDir, { recursive: true });
			await writeFile(join(runDir, "bundle.json"), "{not json\n", "utf-8");

			await expect(listBundles(storeRoot)).rejects.toThrow(VibechkError);
			await expect(listBundles(storeRoot)).rejects.toThrow("has an invalid bundle.json");
		});
	});
});
