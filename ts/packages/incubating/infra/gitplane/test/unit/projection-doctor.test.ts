import { expect, test } from "vitest";
import { buildProjectionPlan, evaluateDoctor, resolveJsonPointer } from "@nseng-ai/gitplane";

const target = {
	table: "greetings",
	lineage: {
		sourceId: "source_id",
		artifactId: "artifact_id",
		revisionId: "revision_id",
		path: "artifact_path",
		deleted: "deleted",
		deletedAtCommit: "deleted_at",
	},
};
const kind = {
	apiVersion: "example/v1",
	kind: "Greeting",
	target,
	schemaVersions: {
		1: {
			fields: {
				"/a~1b/~0key": { target: "message" },
				"/settings": { target: "settings", mode: "json" as const },
				"/missing": { target: "optional" },
			},
			clearFields: ["legacy"],
		},
	},
	transitions: [],
};

test("resolves RFC 6901 pointers including empty and escaped tokens", () => {
	const value = { "a/b": { "~key": "hello" }, list: ["zero"] };
	expect(resolveJsonPointer(value, "")).toEqual({ type: "found", value });
	expect(resolveJsonPointer(value, "/a~1b/~0key")).toEqual({ type: "found", value: "hello" });
	expect(resolveJsonPointer(value, "/list/0")).toEqual({ type: "found", value: "zero" });
	expect(resolveJsonPointer(value, "/list/01")).toEqual({ type: "missing" });
	expect(resolveJsonPointer({ "bad~2": true }, "/bad~2")).toEqual({ type: "missing" });
	expect(resolveJsonPointer({ "bad~": true }, "/bad~")).toEqual({ type: "missing" });
});

test("builds complete projection plans with nulls, modes, and clears", () => {
	expect(
		buildProjectionPlan(
			{ "a/b": { "~key": "hello" }, settings: { enabled: true } },
			kind.schemaVersions[1],
		),
	).toEqual({
		fields: [
			{ column: "message", mode: "scalar", value: "hello" },
			{ column: "optional", mode: "scalar", value: null },
			{ column: "settings", mode: "json", value: { enabled: true } },
		],
		clearFields: ["legacy"],
	});
});

test("evaluates deterministic doctor checks and exact uniqueness", () => {
	const checks = evaluateDoctor({
		sourceId: "source",
		kinds: [kind],
		introspection: {
			controlSchema: { state: "compatible", version: 1 },
			targetTables: [
				{
					name: "greetings",
					columns: [...Object.values(target.lineage), "message", "settings", "optional", "legacy"],
					uniqueColumnSets: [["source_id", "artifact_id", "revision_id"]],
				},
			],
			jsonProjection: {
				requirement: "optional",
				status: "unsupported",
				detail: "Unavailable.",
			},
		},
	});
	expect(checks.map((item) => [item.code, item.status])).toEqual([
		["control-schema", "pass"],
		["target-table", "pass"],
		["target-columns", "pass"],
		["target-lineage-columns", "pass"],
		["target-source-artifact-uniqueness", "fail"],
		["target-json-mapping-support", "unsupported"],
	]);
});

test("fails unsupported required doctor capabilities", () => {
	const checks = evaluateDoctor({
		sourceId: "source",
		kinds: [kind],
		introspection: {
			controlSchema: { state: "compatible", version: 1 },
			targetTables: [
				{
					name: "greetings",
					columns: [...Object.values(target.lineage), "message", "settings", "optional", "legacy"],
					uniqueColumnSets: [["source_id", "artifact_id"]],
				},
			],
			jsonProjection: {
				requirement: "required",
				status: "unsupported",
				detail: "Required capability unavailable.",
			},
		},
	});
	expect(checks.find((check) => check.code === "target-json-mapping-support")?.status).toBe("fail");
});

test("orders doctor kinds by deterministic API-version then kind code units", () => {
	const checks = evaluateDoctor({
		sourceId: "source",
		kinds: [
			{ ...kind, apiVersion: "a", kind: "z" },
			{ ...kind, apiVersion: "A", kind: "z" },
			{ ...kind, apiVersion: "a", kind: "A" },
		],
		introspection: {
			controlSchema: { state: "compatible", version: 1 },
			targetTables: [],
			jsonProjection: { requirement: "required", status: "pass", detail: "Available." },
		},
	});
	expect(
		checks.filter((check) => check.code === "target-table").map((check) => check.subject),
	).toEqual(["A/z:greetings", "a/A:greetings", "a/z:greetings"]);
});
