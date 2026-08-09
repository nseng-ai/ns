import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "vitest";

import { createClinkrApp } from "@nseng-ai/clinkr/app";
import { runForCliTest } from "@nseng-ai/clinkr/app/testing";

const README_PATH = path.resolve(
	import.meta.dirname,
	"../../../../../../.ns/objectives/clinkr-readme-driven-development/references/README-draft.md",
);
const EXAMPLES_DIRECTORY = path.join(import.meta.dirname, "type/readme-examples");

interface Fence {
	readonly heading: string;
	readonly ordinal: number;
	readonly text: string;
}

interface RegionReference {
	readonly path: string;
	readonly region: string;
	readonly separatorBefore?: string;
}

const FENCE_REGIONS = new Map<number, readonly RegionReference[]>([
	[
		1,
		[
			{ path: "../../fixtures/readme-greet/metadata.ts", region: "whole" },
			{ path: "../../fixtures/readme-greet/command.ts", region: "whole" },
		],
	],
	[2, [{ path: "../../fixtures/readme-greet/app.ts", region: "whole" }]],
	[3, [{ path: "03-projection-fragment.ts", region: "3" }]],
	[
		4,
		[
			{ path: "04-find/metadata.ts", region: "4-A" },
			{ path: "04-find/command.ts", region: "4-B1" },
			{ path: "04-find/command.ts", region: "4-B2", separatorBefore: "\n" },
		],
	],
	[5, [{ path: "05-rendering.ts", region: "5" }]],
	[6, [{ path: "06-renderer-fragment.ts", region: "6" }]],
	[7, [{ path: "07-group.ts", region: "7" }]],
	[
		8,
		[
			{ path: "08-list/metadata.ts", region: "8-A" },
			{ path: "08-list/command.ts", region: "8-B" },
		],
	],
	[9, [{ path: "09-completion.ts", region: "9" }]],
	[10, [{ path: "10-context-app.ts", region: "10" }]],
	[11, [{ path: "11-testing.ts", region: "11" }]],
	[
		12,
		[
			{ path: "12-outcomes.ts", region: "12-A" },
			{ path: "12-outcomes.ts", region: "12-B" },
		],
	],
	[
		13,
		[
			{ path: "13-schemas.ts", region: "13-A" },
			{ path: "13-schemas.ts", region: "13-B", separatorBefore: "\n" },
		],
	],
	[14, [{ path: "14-confirmation.ts", region: "14" }]],
	[15, [{ path: "15-raw.ts", region: "15" }]],
]);

function typescriptFences(markdown: string): Fence[] {
	const lines = markdown.replaceAll("\r\n", "\n").split("\n");
	const fences: Fence[] = [];
	let heading = "";
	let ordinal = 0;
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (line === undefined) throw new Error("README line lookup failed");
		if (line.startsWith("#")) heading = line.replace(/^#+\s*/, "");
		if (line !== "```ts") continue;
		const content: string[] = [];
		for (index += 1; index < lines.length && lines[index] !== "```"; index += 1) {
			const contentLine = lines[index];
			if (contentLine === undefined) throw new Error("README fence lookup failed");
			content.push(contentLine);
		}
		ordinal += 1;
		fences.push({ heading, ordinal, text: content.join("\n") });
	}
	return fences;
}

function extractRegion(source: string, region: string): string {
	const normalized = source.replaceAll("\r\n", "\n");
	if (region === "whole") return normalized.replace(/\n$/, "");
	const startMarker = `// README-FENCE-${region}-START`;
	const endMarker = `// README-FENCE-${region}-END`;
	const start = normalized.indexOf(startMarker);
	const end = normalized.indexOf(endMarker);
	if (start < 0 || end < 0 || end <= start) throw new Error(`Malformed fixture region ${region}`);
	return normalized
		.slice(start + startMarker.length + 1, end)
		.replace(/^\s*\/\/ @ts-expect-error README-COMPILE-SCAFFOLD:.*\n/gm, "")
		.replace(/\n$/, "");
}

async function synchronizedText(references: readonly RegionReference[]): Promise<string> {
	const regions = await Promise.all(
		references.map(async (reference) => ({
			text: extractRegion(
				await readFile(path.join(EXAMPLES_DIRECTORY, reference.path), "utf8"),
				reference.region,
			),
			separatorBefore: reference.separatorBefore ?? "\n\n",
		})),
	);
	return regions
		.map((region, index) => `${index === 0 ? "" : region.separatorBefore}${region.text}`)
		.join("");
}

test("all README TypeScript fences are exactly synchronized with compiled live regions", async () => {
	const fences = typescriptFences(await readFile(README_PATH, "utf8"));
	expect(fences).toHaveLength(15);
	expect([...FENCE_REGIONS.keys()]).toEqual(fences.map((fence) => fence.ordinal));
	for (const fence of fences) {
		const references = FENCE_REGIONS.get(fence.ordinal);
		if (references === undefined) throw new Error(`Missing fence ${fence.ordinal}`);
		expect(
			await synchronizedText(references),
			`${fence.heading} (TypeScript fence ${fence.ordinal})`,
		).toBe(fence.text);
	}
});

for (const [label, argv, stdout] of [
	["long option", ["Ada", "--enthusiastic"], "Hello, Ada!\n"],
	["short option", ["Ada", "-e"], "Hello, Ada!\n"],
	["default", ["Ada"], "Hello, Ada.\n"],
] as const) {
	test(`README greet executes with ${label}`, async () => {
		const run = await runForCliTest(
			await (await import("./fixtures/readme-greet/app.ts")).app(),
			argv,
		);
		expect(run).toEqual({ exitCode: 0, stdout, stderr: "" });
	});
}

test("README greet accepts its complete request as JSON before the root route", async () => {
	const run = await runForCliTest(
		await (await import("./fixtures/readme-greet/app.ts")).app(),
		["--input-json", "--format", "json"],
		{
			readJsonInput: async () => '{"name":"Ada","enthusiastic":true}',
		},
	);
	expect(run).toEqual({
		exitCode: 0,
		stdout:
			'{\n  "status": "success",\n  "exitCode": 0,\n  "data": {\n    "message": "Hello, Ada!"\n  }\n}\n',
		stderr: "",
	});
});

for (const [label, structuredRequest, errorType] of [
	["empty", "", "invalid-json-input"],
	["malformed", "{", "invalid-json-input"],
	["trailing", "{} trailing", "invalid-json-input"],
	["array", "[]", "invalid-json-input"],
	["primitive", '"Ada"', "invalid-json-input"],
	["unknown field", '{"name":"Ada","other":true}', "invalid-request"],
	["schema rejection", '{"name":12}', "invalid-request"],
] as const) {
	test(`README JSON input rejects ${label} input`, async () => {
		const run = await runForCliTest(
			await (await import("./fixtures/readme-greet/app.ts")).app(),
			["--format", "json", "--input-json"],
			{
				readJsonInput: async () => structuredRequest,
			},
		);
		expect(run.exitCode).toBe(2);
		expect(run.stderr).toBe("");
		expect(JSON.parse(run.stdout)).toMatchObject({ status: "usage-error", exitCode: 2, errorType });
	});
}

test("README JSON input cannot mix with argv request fields", async () => {
	const run = await runForCliTest(
		await (await import("./fixtures/readme-greet/app.ts")).app(),
		["Ada", "--input-json", "--format", "json"],
		{
			readJsonInput: async () => '{"name":"Grace"}',
		},
	);
	expect(JSON.parse(run.stdout)).toMatchObject({
		status: "usage-error",
		exitCode: 2,
		errorType: "invalid-request",
	});
});

test("README JSON input cannot be repeated or mixed across source forms", async () => {
	const run = await runForCliTest(
		await (await import("./fixtures/readme-greet/app.ts")).app(),
		["--input-json", "--format=json", "--input-json"],
		{
			readJsonInput: async () => '{"name":"Ada"}',
		},
	);
	expect(JSON.parse(run.stdout)).toMatchObject({
		status: "usage-error",
		exitCode: 2,
		errorType: "invalid-request",
	});
});

test("README nested contacts find executes by canonical name and alias with documented metadata", async () => {
	const app = createClinkrApp({
		name: "directory",
		commandDirectory: path.join(import.meta.dirname, "fixtures/readme-recursive"),
	});
	const canonical = await runForCliTest(app, ["contacts", "find", "Ada", "--include-archived"]);
	expect(canonical).toEqual({
		exitCode: 0,
		stdout: "Ada (archived)\nAda\n",
		stderr: "",
	});
	const alias = await runForCliTest(app, ["contacts", "lookup", "Grace", "--limit", "1"]);
	expect(alias).toEqual({ exitCode: 0, stdout: "Grace\n", stderr: "" });
	const help = await runForCliTest(app, ["contacts", "--help"]);
	expect(help.stdout).toContain("Contacts\n  find|lookup");
	expect(help.stdout).toContain("Find a contact");
});

test("README group.ts is discovered and its nested issues list executes", async () => {
	const app = createClinkrApp({
		name: "directory",
		commandDirectory: path.join(import.meta.dirname, "fixtures/readme-recursive"),
	});
	const rootHelp = await runForCliTest(app, ["--help"]);
	expect(rootHelp.stdout).toContain("issues|issue");
	expect(rootHelp.stdout).toContain("Issue workflows");
	const issuesHelp = await runForCliTest(app, ["issues", "--help"]);
	expect(issuesHelp.stdout).toContain("list");
	expect(await runForCliTest(app, ["issue", "list"])).toEqual({
		exitCode: 0,
		stdout: "Fix login\n",
		stderr: "",
	});
});

test("README app completion merges app and provider candidates without running the handler", async () => {
	let checkouts = 0;
	const app = createClinkrApp<{
		readonly git: {
			listBranches(): Promise<readonly string[]>;
			checkout(branch: string): Promise<void>;
		};
	}>({
		name: "repo",
		commandDirectory: path.join(import.meta.dirname, "fixtures/readme-completion"),
		requiresContext: true,
		completion: {},
	});
	const context = {
		git: {
			listBranches: async () => ["main", "maint", "topic"],
			checkout: async () => {
				checkouts += 1;
			},
		},
	};
	const root = await app.complete({ words: [""] }, { context });
	expect(root.candidates.map(({ value }) => value)).toEqual(["checkout", "completion"]);
	const branches = await app.complete({ words: ["checkout", "--branch", "mai"] }, { context });
	expect(branches.candidates).toEqual([
		{ value: "main", type: "positional-value" },
		{ value: "maint", type: "positional-value" },
	]);
	const staticCandidates = await app.complete({ words: ["checkout", "--"] }, { context });
	expect(staticCandidates.candidates.map(({ value }) => value)).toEqual(
		expect.arrayContaining(["--format", "--json-schema", "--input-json", "--help"]),
	);
	expect(checkouts).toBe(0);
});

test("README contextful contacts app executes its nested command through runForCliTest", async () => {
	let additions = 0;
	const run = await runForCliTest(
		await (await import("./fixtures/readme-contacts/app.ts")).app(),
		["list"],
		{
			context: {
				contacts: {
					list: async () => ["Ada", "Grace"],
					add: async () => {
						additions += 1;
					},
				},
			},
		},
	);
	expect(run).toEqual({ exitCode: 0, stdout: "Ada\nGrace\n", stderr: "" });
	expect(additions).toBe(0);
});
