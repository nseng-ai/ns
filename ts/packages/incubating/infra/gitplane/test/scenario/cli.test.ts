import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { runForCliTest } from "@nseng-ai/clinkr/app/testing";
import { createGitplaneCliApp, VERSION } from "@nseng-ai/gitplane/cli";
import type { GitplaneConfigGateway } from "@nseng-ai/gitplane/cli";
import { InMemoryArtifactGateway, InMemoryCorpusCheckGateway } from "@nseng-ai/gitplane/testing";
import { parseArtifactId } from "@nseng-ai/gitplane";
import type { CorpusCheckGateway } from "@nseng-ai/gitplane";
const parsed = parseArtifactId("01jxyz8y3jqazj7jrx53w9b3dn");
if (!parsed.ok) throw new Error();
const artifactId = parsed.artifactId;
const app = createGitplaneCliApp();
interface ContextOptions {
	readonly artifactGateway?: InMemoryArtifactGateway;
	readonly configGateway?: GitplaneConfigGateway;
	readonly corpusCheckGateway?: CorpusCheckGateway;
}
function context(options: ContextOptions = {}) {
	return {
		artifactGateway: options.artifactGateway ?? new InMemoryArtifactGateway(),
		artifactIds: { generateArtifactId: () => artifactId },
		configGateway: options.configGateway ?? {
			load: async () => ({
				ok: false as const,
				category: "config-load" as const,
				diagnostic: "missing",
			}),
		},
		corpusCheckGateway: options.corpusCheckGateway ?? new InMemoryCorpusCheckGateway(),
		cwd: ".",
	};
}
function loadedConfig(options: { readonly root?: string; readonly id?: string } = {}) {
	return {
		load: async () => ({
			ok: true as const,
			artifactRoot: options.root ?? "artifacts",
			config: {
				source: { id: options.id ?? "source", artifactRoot: options.root ?? "artifacts" },
				store: () => {
					throw new Error("check must not construct the store");
				},
			},
		}),
	};
}
test.each([
	["--version", VERSION],
	["--runtime", "node"],
	["-h", "artifact"],
	["artifact", "create"],
])("supports %s", async (argument, text) => {
	const run = await runForCliTest(app, argument === "artifact" ? [argument, "-h"] : [argument], {
		context: context(),
	});
	expect(run.exitCode).toBe(0);
	expect(run.stdout).toContain(text);
});

test("keeps application version synchronized with the package manifest", async () => {
	const manifest = JSON.parse(
		await readFile(new URL("../../package.json", import.meta.url), "utf8"),
	) as unknown;
	expect(manifest).toMatchObject({ version: VERSION });
});

test("creates generic and classified artifacts through typed envelopes", async () => {
	const gateway = new InMemoryArtifactGateway();
	const run = await runForCliTest(app, ["artifact", "create", "x", "--format=json"], {
		context: context({ artifactGateway: gateway }),
	});
	expect(run.exitCode).toBe(0);
	expect(JSON.parse(run.stdout)).toMatchObject({
		status: "success",
		data: { directory: "x", artifactId },
	});
	const createdArtifacts = gateway.createdArtifacts();
	expect(createdArtifacts).toHaveLength(1);
	const createdArtifact = createdArtifacts[0];
	if (createdArtifact === undefined) throw new Error("Expected one created artifact");
	expect(createdArtifact.marker).toBe(`{\n  "gpId": "${artifactId}"\n}\n`);
	const classified = new InMemoryArtifactGateway();
	await runForCliTest(
		app,
		[
			"artifact",
			"create",
			"y",
			"--kind",
			"Greeting",
			"--api-version",
			"example/v1",
			"--schema-version",
			"2",
		],
		{ context: context({ artifactGateway: classified }) },
	);
	const classifiedArtifacts = classified.createdArtifacts();
	expect(classifiedArtifacts).toHaveLength(1);
	const classifiedArtifact = classifiedArtifacts[0];
	if (classifiedArtifact === undefined) throw new Error("Expected one classified artifact");
	expect(JSON.parse(classifiedArtifact.marker)).toEqual({
		gpApiVersion: "example/v1",
		gpKind: "Greeting",
		gpSchemaVersion: 2,
		gpId: artifactId,
	});
});
test("accepts supplied IDs through long and short options", async () => {
	for (const option of ["--id", "-i"]) {
		const gateway = new InMemoryArtifactGateway();
		const run = await runForCliTest(app, ["artifact", "create", option, artifactId, "x"], {
			context: context({ artifactGateway: gateway }),
		});
		expect(run.exitCode).toBe(0);
		expect(gateway.createdArtifacts()[0]?.artifactId).toBe(artifactId);
	}
});

test("uses classification defaults", async () => {
	const gateway = new InMemoryArtifactGateway();
	const run = await runForCliTest(app, ["artifact", "create", "x", "--kind", "Greeting"], {
		context: context({ artifactGateway: gateway }),
	});
	expect(run.exitCode).toBe(0);
	const createdArtifacts = gateway.createdArtifacts();
	expect(createdArtifacts).toHaveLength(1);
	const createdArtifact = createdArtifacts[0];
	if (createdArtifact === undefined) throw new Error("Expected one created artifact");
	expect(JSON.parse(createdArtifact.marker)).toMatchObject({
		gpApiVersion: "gitplane/v0",
		gpKind: "Greeting",
		gpSchemaVersion: 1,
	});
});

test("rejects invalid supplied IDs", async () => {
	const run = await runForCliTest(
		app,
		["artifact", "create", "x", "--id", "not-an-id", "--format=json"],
		{ context: context() },
	);
	expect(run.exitCode).toBe(2);
	expect(JSON.parse(run.stdout)).toMatchObject({
		status: "usage-error",
		data: { argument: "--id", code: "invalid-artifact-id" },
	});
});

test("create help documents ID options", async () => {
	const run = await runForCliTest(app, ["artifact", "create", "--help"], {
		context: context(),
	});
	expect(run.exitCode).toBe(0);
	expect(run.stdout).toContain("--id");
	expect(run.stdout).toContain("-i");
});

test.each([
	{
		name: "empty kind",
		arguments: ["--kind="],
		argument: "--kind",
	},
	{
		name: "empty API version",
		arguments: ["--kind", "Greeting", "--api-version="],
		argument: "--api-version",
	},
	{
		name: "non-positive schema version",
		arguments: ["--kind", "Greeting", "--schema-version", "0"],
		argument: "--schema-version",
	},
	{
		name: "classification without kind",
		arguments: ["--api-version", "a"],
		argument: "--api-version",
	},
])(
	"attributes $name usage errors to the option",
	async ({ arguments: optionArguments, argument }) => {
		const run = await runForCliTest(
			app,
			["artifact", "create", "x", ...optionArguments, "--format=json"],
			{ context: context() },
		);
		expect(run.exitCode).toBe(2);
		expect(JSON.parse(run.stdout)).toMatchObject({
			status: "usage-error",
			data: { argument },
		});
	},
);

test("reports operational and unavailable outcomes", async () => {
	const collision = new InMemoryArtifactGateway({
		created: [{ directory: "x", artifactId, marker: "" }],
	});
	const negative = await runForCliTest(app, ["artifact", "create", "x", "--format=json"], {
		context: context({ artifactGateway: collision }),
	});
	expect(JSON.parse(negative.stdout)).toMatchObject({
		status: "negative",
		data: { code: "target-exists" },
	});
	const failure = new InMemoryArtifactGateway({
		failures: { createArtifact: { code: "denied", message: "no" } },
	});
	const failed = await runForCliTest(app, ["artifact", "create", "x", "--format=json"], {
		context: context({ artifactGateway: failure }),
	});
	expect(JSON.parse(failed.stdout)).toMatchObject({
		status: "failure",
		errorType: "artifact-create-failed",
	});
	const stub = await runForCliTest(app, ["check", "--format=json"], { context: context() });
	expect(JSON.parse(stub.stdout)).toMatchObject({
		status: "failure",
		errorType: "check-failed",
	});
});
test("publishes command schemas", async () => {
	for (const command of [
		["artifact", "create", "--json-schema"],
		["check", "--json-schema"],
	]) {
		const run = await runForCliTest(app, command, { context: context() });
		expect(run.exitCode).toBe(0);
		expect(JSON.parse(run.stdout)).toHaveProperty("machineEnvelopeJsonSchema");
	}
});

test("check returns exact clean data for an empty root without history or store operations", async () => {
	const gateway = new InMemoryCorpusCheckGateway({
		workingInventories: [{ artifactRoot: "artifacts", entries: [] }],
	});
	const run = await runForCliTest(app, ["check", "--format=json"], {
		context: context({ configGateway: loadedConfig(), corpusCheckGateway: gateway }),
	});
	expect(run.exitCode).toBe(0);
	expect(JSON.parse(run.stdout)).toEqual({
		status: "success",
		exitCode: 0,
		data: {
			sourceId: "source",
			artifactRoot: "artifacts",
			artifactCount: 0,
			errorCount: 0,
			warningCount: 0,
			findings: [],
		},
	});
	expect(gateway.operationLog()).toEqual(["inventoryWorkingTree"]);
});

test("check returns deterministic corpus findings as exit 1 data", async () => {
	const gateway = new InMemoryCorpusCheckGateway({
		workingInventories: [
			{
				artifactRoot: "artifacts",
				entries: [
					{ path: "artifacts/b/gitplane-artifact.json", kind: "regular-file" },
					{ path: "artifacts/a/gitplane-artifact.json", kind: "regular-file" },
				],
			},
		],
		workingCandidates: [
			{
				path: "artifacts/a",
				entries: [
					{ path: "gitplane-artifact.json", kind: "regular-file", bytes: Buffer.from("not json") },
				],
			},
			{
				path: "artifacts/b",
				entries: [
					{ path: "gitplane-artifact.json", kind: "regular-file", bytes: Buffer.from("{}") },
				],
			},
		],
	});
	const run = await runForCliTest(app, ["check", "--format=json"], {
		context: context({ configGateway: loadedConfig(), corpusCheckGateway: gateway }),
	});
	expect(run.exitCode).toBe(1);
	expect(JSON.parse(run.stdout)).toEqual({
		status: "negative",
		exitCode: 1,
		message: "Artifact corpus is invalid.",
		data: {
			sourceId: "source",
			artifactRoot: "artifacts",
			artifactCount: 2,
			errorCount: 2,
			warningCount: 0,
			findings: [
				{
					code: "invalid-marker-json",
					severity: "error",
					summary: "Artifact marker must contain a JSON object.",
					artifactPath: "artifacts/a",
					relativePath: "gitplane-artifact.json",
				},
				{
					code: "invalid-marker-envelope",
					severity: "error",
					summary: "Artifact marker requires gpId.",
					artifactPath: "artifacts/b",
					relativePath: "gitplane-artifact.json",
					jsonPointer: "/gpId",
				},
			],
		},
	});
	expect(
		JSON.parse(run.stdout).data.findings.map(
			(finding: { artifactPath?: string; code: string }) =>
				`${finding.artifactPath ?? ""}:${finding.code}`,
		),
	).toEqual(["artifacts/a:invalid-marker-json", "artifacts/b:invalid-marker-envelope"]);
});

test.each(["--config", "-c"])("check forwards %s exactly once", async (option) => {
	const requests: unknown[] = [];
	const gateway = new InMemoryCorpusCheckGateway({
		workingInventories: [{ artifactRoot: "empty", entries: [] }],
	});
	const run = await runForCliTest(app, ["check", option, "config/custom.ts"], {
		context: context({
			configGateway: {
				load: async (request) => {
					requests.push(request);
					return {
						ok: true as const,
						artifactRoot: "empty",
						config: {
							source: { id: "s", artifactRoot: "empty" },
							store: () => {
								throw new Error("check must not construct the store");
							},
						},
					};
				},
			},
			corpusCheckGateway: gateway,
		}),
	});
	expect(run.exitCode).toBe(0);
	expect(requests).toEqual([{ cwd: ".", configPath: "config/custom.ts" }]);
});

test.each([
	{
		name: "config failure",
		gateway: new InMemoryCorpusCheckGateway(),
		loader: {
			load: async () => ({
				ok: false as const,
				category: "config-load" as const,
				diagnostic: "Unable to load configuration module.",
				path: "gitplane.config.ts",
			}),
		},
		data: {
			category: "config-load",
			diagnostic: "Unable to load configuration module.",
			path: "gitplane.config.ts",
		},
	},
	{
		name: "inventory failure",
		gateway: new InMemoryCorpusCheckGateway({
			failures: {
				inventoryWorkingTree: { code: "source-error", message: "/host/private contents" },
			},
		}),
		loader: loadedConfig(),
		data: {
			category: "source-read-failed",
			diagnostic: "Unable to inventory the artifact root.",
			path: "artifacts",
			causeCode: "source-error",
		},
	},
	{
		name: "candidate read failure",
		gateway: new InMemoryCorpusCheckGateway({
			workingInventories: [
				{
					artifactRoot: "artifacts",
					entries: [{ path: "artifacts/a/gitplane-artifact.json", kind: "regular-file" }],
				},
			],
			failures: {
				readWorkingTreeCandidate: { code: "source-error", message: "/host/private contents" },
			},
		}),
		loader: loadedConfig(),
		data: {
			category: "source-read-failed",
			diagnostic: "Unable to read an artifact candidate.",
			path: "artifacts/a",
			causeCode: "source-error",
		},
	},
])("check returns exact sanitized exit 2 data for $name", async ({ gateway, loader, data }) => {
	const run = await runForCliTest(app, ["check", "--format=json"], {
		context: context({ configGateway: loader, corpusCheckGateway: gateway }),
	});
	expect(run.exitCode).toBe(2);
	expect(JSON.parse(run.stdout)).toEqual({
		status: "failure",
		exitCode: 2,
		errorType: "check-failed",
		message: "Unable to check the artifact corpus.",
		data,
	});
	expect(run.stdout).not.toContain("/host/private");
	expect(run.stdout).not.toContain("artifactCount");
	expect(run.stdout).not.toContain("findings");
	expect(JSON.parse(run.stdout).data).not.toHaveProperty("corpus");
});

test("check maps unexpected config throws to a sanitized config load failure", async () => {
	const run = await runForCliTest(app, ["check", "--format=json"], {
		context: context({
			configGateway: {
				load: async () => {
					throw new Error("/host/private secret artifact bytes");
				},
			},
		}),
	});
	expect(run.exitCode).toBe(2);
	expect(JSON.parse(run.stdout)).toEqual({
		status: "failure",
		exitCode: 2,
		errorType: "check-failed",
		message: "Unable to check the artifact corpus.",
		data: { category: "config-load", diagnostic: "Unexpected configuration load failure." },
	});
	expect(run.stdout).not.toContain("/host/private");
});

test("check maps unexpected source throws to a sanitized source read failure", async () => {
	const throwing: CorpusCheckGateway = {
		inventoryWorkingTree: async () => {
			throw new Error("/host/private secret artifact bytes");
		},
		readWorkingTreeCandidate: async () => {
			throw new Error("/host/private secret artifact bytes");
		},
	};
	const run = await runForCliTest(app, ["check", "--format=json"], {
		context: context({ configGateway: loadedConfig(), corpusCheckGateway: throwing }),
	});
	expect(run.exitCode).toBe(2);
	expect(JSON.parse(run.stdout)).toEqual({
		status: "failure",
		exitCode: 2,
		errorType: "check-failed",
		message: "Unable to check the artifact corpus.",
		data: { category: "source-read-failed", diagnostic: "Unexpected source read failure." },
	});
	expect(run.stdout).not.toContain("/host/private");
});
