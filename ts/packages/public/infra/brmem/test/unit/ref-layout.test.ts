import { describe, expect, it } from "vitest";

import {
	buildEntryLocator,
	buildSnapshotRef,
	decodeBranchName,
	encodeBranchName,
	parseEntryLocator,
	parseSnapshotRef,
} from "../../src/ref-layout.ts";

describe("ref layout", () => {
	it("builds Base Namespace and named Namespace Snapshot Refs", () => {
		expect(buildSnapshotRef("base", "feat/x")).toEqual({
			type: "ok",
			value: "refs/brmem/base/feat---x",
		});
		expect(buildSnapshotRef("notes", "feat/x")).toEqual({
			type: "ok",
			value: "refs/brmem/ns/notes/feat---x",
		});
	});

	it("encodes slash-separated branches and rejects ambiguous encoded separators", () => {
		expect(encodeBranchName("user/feature/x")).toEqual({ type: "ok", value: "user---feature---x" });
		expect(decodeBranchName("user---feature---x")).toBe("user/feature/x");
		expect(encodeBranchName("feat---x").type).toBe("error");
	});

	it("parses valid Snapshot Refs and skips malformed refs", () => {
		expect(parseSnapshotRef("refs/brmem/base/feat---x")).toMatchObject({
			namespace: "base",
			branch: "feat/x",
		});
		expect(parseSnapshotRef("refs/brmem/ns/notes/feat---x")).toMatchObject({
			namespace: "notes",
			branch: "feat/x",
		});
		expect(parseSnapshotRef("refs/brmem/ns/base/feat---x")).toBeUndefined();
		expect(parseSnapshotRef("refs/brmem/base/feat/x")).toBeUndefined();
		expect(parseSnapshotRef("refs/heads/main")).toBeUndefined();
	});

	it("builds and parses Entry Locators while preserving nested keys", () => {
		expect(buildEntryLocator("notes", "plan/body.md", "feat/x")).toEqual({
			type: "ok",
			value: "refs/brmem/ns/notes/feat---x:plan/body.md",
		});
		expect(parseEntryLocator("refs/brmem/ns/notes/feat---x:plan/body.md")).toMatchObject({
			namespace: "notes",
			branch: "feat/x",
			key: "plan/body.md",
		});
	});
});
