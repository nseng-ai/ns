import path from "node:path";
import { expect, test } from "vitest";
import { parseGitplaneConfigModule } from "../../src/cli/config-gateway.ts";

const cwd = path.resolve("/work/repo");
const target = {
	table: "artifacts",
	lineage: {
		sourceId: "source_id",
		artifactId: "artifact_id",
		revisionId: "revision_id",
		path: "path",
		deleted: "deleted",
		deletedAtCommit: "deleted_at_commit",
	},
};
const kind = {
	apiVersion: "example/v1",
	kind: "Greeting",
	schemaVersions: {
		1: { fields: { "/message": { target: "message" } } },
		2: { fields: {}, clearFields: ["old"] },
	},
	transitions: [{ from: 1, to: 2 }],
	target,
};

function parse(config: unknown, configPath?: string) {
	return parseGitplaneConfigModule(
		{ default: config },
		{ cwd, ...(configPath === undefined ? {} : { configPath }) },
	);
}

const store = () => {
	throw new Error("must not construct the store while parsing");
};
function source(artifactRoot = "artifacts") {
	return { source: { id: " source-id\n", artifactRoot }, store };
}

test("parses the minimum config and preserves the source ID bytes", () => {
	expect(parse(source())).toEqual({
		ok: true,
		config: { source: { id: " source-id\n", artifactRoot: "artifacts" }, store },
		artifactRoot: "artifacts",
		absoluteArtifactRoot: path.join(cwd, "artifacts"),
	});
});

test.each([
	["empty root", ""],
	["escaped tokens", "/a~1b/~0key"],
] as const)("accepts %s projection pointers", (_name, pointer) => {
	const configuredKind = {
		...kind,
		schemaVersions: { 1: { fields: { [pointer]: { target: "message" } } } },
		transitions: [],
	};
	expect(parse({ ...source(), kinds: [configuredKind] })).toMatchObject({ ok: true });
});

test("parses optional kinds and does not invoke the store", () => {
	let storeCalls = 0;
	const store = () => {
		storeCalls += 1;
		throw new Error("must not run while parsing");
	};
	const result = parse({ ...source(), kinds: [kind], store });
	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.config.kinds).toEqual([kind]);
		expect(result.config.store).toBe(store);
	}
	expect(storeCalls).toBe(0);
});

test("requires a store factory", () => {
	const result = parse({ source: source().source });
	expect(result).toMatchObject({
		ok: false,
		category: "config-invalid",
		path: "gitplane.config.ts",
	});
	if (!result.ok) expect(result.diagnostic).toContain("store");
});

test("requires a default export", () => {
	expect(parseGitplaneConfigModule({}, { cwd })).toEqual({
		ok: false,
		category: "config-load",
		diagnostic: "Configuration module must have a default export.",
		path: "gitplane.config.ts",
	});
});

test.each([
	{
		name: "duplicate kinds",
		config: { ...source(), kinds: [kind, kind] },
		diagnostic: "Kind registrations must be unique.",
	},
	{
		name: "empty schema map",
		config: { ...source(), kinds: [{ ...kind, schemaVersions: {} }] },
		diagnostic: "Schema version keys must be unique positive integers.",
	},
	{
		name: "invalid schema key",
		config: { ...source(), kinds: [{ ...kind, schemaVersions: { "01": { fields: {} } } }] },
		diagnostic: "Schema version keys must be unique positive integers.",
	},
	{
		name: "JSON pointer without a leading slash",
		config: {
			...source(),
			kinds: [{ ...kind, schemaVersions: { 1: { fields: { bad: { target: "message" } } } } }],
		},
		diagnostic: "Projection field keys must be valid RFC 6901 JSON pointers.",
	},
	{
		name: "dangling JSON pointer escape",
		config: {
			...source(),
			kinds: [{ ...kind, schemaVersions: { 1: { fields: { "/bad~": { target: "message" } } } } }],
		},
		diagnostic: "Projection field keys must be valid RFC 6901 JSON pointers.",
	},
	{
		name: "invalid JSON pointer escape",
		config: {
			...source(),
			kinds: [{ ...kind, schemaVersions: { 1: { fields: { "/bad~2": { target: "message" } } } } }],
		},
		diagnostic: "Projection field keys must be valid RFC 6901 JSON pointers.",
	},
	{
		name: "self transition",
		config: { ...source(), kinds: [{ ...kind, transitions: [{ from: 1, to: 1 }] }] },
		diagnostic: "Transitions must be unique, non-self edges between declared schema versions.",
	},
	{
		name: "duplicate transition",
		config: {
			...source(),
			kinds: [
				{
					...kind,
					transitions: [
						{ from: 1, to: 2 },
						{ from: 1, to: 2 },
					],
				},
			],
		},
		diagnostic: "Transitions must be unique, non-self edges between declared schema versions.",
	},
	{
		name: "unknown transition version",
		config: { ...source(), kinds: [{ ...kind, transitions: [{ from: 2, to: 3 }] }] },
		diagnostic: "Transitions must be unique, non-self edges between declared schema versions.",
	},
])("rejects $name", ({ config, diagnostic }) => {
	expect(parse(config)).toEqual({
		ok: false,
		category: "config-invalid",
		diagnostic,
		path: "gitplane.config.ts",
	});
});

test("reports schema paths without exposing module paths", () => {
	const result = parse({
		source: { id: "id", artifactRoot: "artifacts", secret: true },
		store,
	});
	expect(result).toMatchObject({
		ok: false,
		category: "config-invalid",
		path: "gitplane.config.ts",
	});
	if (!result.ok) {
		expect(result.diagnostic).toContain("source");
		expect(result.diagnostic).not.toContain(cwd);
	}
});

test.each([
	{
		name: "absolute root",
		artifactRoot: "/private/artifacts",
		category: "config-invalid",
		diagnostic: "source.artifactRoot must be relative.",
	},
	{
		name: "root outside cwd",
		artifactRoot: "../outside",
		category: "source-root-invalid",
		diagnostic: "Artifact root must be within the invocation directory.",
	},
])("rejects $name", ({ artifactRoot, category, diagnostic }) => {
	expect(parse(source(artifactRoot))).toMatchObject({ ok: false, category, diagnostic });
});

test("resolves artifact roots from config directory and reports them relative to cwd", () => {
	expect(parse(source("../artifacts"), "config/gitplane.ts")).toMatchObject({
		ok: true,
		artifactRoot: "artifacts",
		absoluteArtifactRoot: path.join(cwd, "artifacts"),
	});
});
