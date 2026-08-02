import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { runForCliTest } from "@nseng-ai/clinkr/app/testing";
import { createGitplaneCliApp, VERSION } from "@nseng-ai/gitplane/cli";
import { InMemoryArtifactGateway } from "@nseng-ai/gitplane/testing";
import { parseArtifactId } from "@nseng-ai/gitplane";
const parsed = parseArtifactId("01jxyz8y3jqazj7jrx53w9b3dn");
if (!parsed.ok) throw new Error();
const artifactId = parsed.artifactId;
const app = createGitplaneCliApp();
function context(gateway = new InMemoryArtifactGateway()) {
	return { artifactGateway: gateway, artifactIds: { generateArtifactId: () => artifactId } };
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
		context: context(gateway),
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
		{ context: context(classified) },
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
			context: context(gateway),
		});
		expect(run.exitCode).toBe(0);
		expect(gateway.createdArtifacts()[0]?.artifactId).toBe(artifactId);
	}
});

test("uses classification defaults", async () => {
	const gateway = new InMemoryArtifactGateway();
	const run = await runForCliTest(app, ["artifact", "create", "x", "--kind", "Greeting"], {
		context: context(gateway),
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
		context: context(collision),
	});
	expect(JSON.parse(negative.stdout)).toMatchObject({
		status: "negative",
		data: { code: "target-exists" },
	});
	const failure = new InMemoryArtifactGateway({
		failures: { createArtifact: { code: "denied", message: "no" } },
	});
	const failed = await runForCliTest(app, ["artifact", "create", "x", "--format=json"], {
		context: context(failure),
	});
	expect(JSON.parse(failed.stdout)).toMatchObject({
		status: "failure",
		errorType: "artifact-create-failed",
	});
	const stub = await runForCliTest(app, ["check", "--format=json"], { context: context() });
	expect(JSON.parse(stub.stdout)).toMatchObject({
		status: "failure",
		errorType: "command-unavailable",
	});
});
test("publishes the command schema", async () => {
	const run = await runForCliTest(app, ["artifact", "create", "--json-schema"], {
		context: context(),
	});
	expect(run.exitCode).toBe(0);
	expect(JSON.parse(run.stdout)).toHaveProperty("machineEnvelopeJsonSchema");
});
