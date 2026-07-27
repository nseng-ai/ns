import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "vitest";

import { app } from "./fixtures/readme-greet/app.ts";
import { runForTest } from "@nseng-ai/clinkr/testing";

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
	return normalized.slice(start + startMarker.length + 1, end).replace(/\n$/, "");
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
	expect(fences).toHaveLength(14);
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
		const run = await runForTest(await app(), argv);
		expect(run).toEqual({ exitCode: 0, stdout, stderr: "" });
	});
}

test("README greet accepts its complete request as JSON before the root route", async () => {
	const run = await runForTest(await app(), ["--input-json", "--format", "json"], {
		stdin: '{"name":"Ada","enthusiastic":true}',
	});
	expect(run).toEqual({
		exitCode: 0,
		stdout:
			'{\n  "status": "success",\n  "exitCode": 0,\n  "data": {\n    "message": "Hello, Ada!"\n  }\n}\n',
		stderr: "",
	});
});

for (const [label, stdin, errorType] of [
	["empty", "", "invalid-json-input"],
	["malformed", "{", "invalid-json-input"],
	["trailing", "{} trailing", "invalid-json-input"],
	["array", "[]", "invalid-json-input"],
	["primitive", '"Ada"', "invalid-json-input"],
	["unknown field", '{"name":"Ada","other":true}', "invalid-request"],
	["schema rejection", '{"name":12}', "invalid-request"],
] as const) {
	test(`README JSON input rejects ${label} input`, async () => {
		const run = await runForTest(await app(), ["--format", "json", "--input-json"], { stdin });
		expect(run.exitCode).toBe(2);
		expect(run.stderr).toBe("");
		expect(JSON.parse(run.stdout)).toMatchObject({ status: "usage-error", exitCode: 2, errorType });
	});
}

test("README JSON input cannot mix with argv request fields", async () => {
	const run = await runForTest(await app(), ["Ada", "--input-json", "--format", "json"], {
		stdin: '{"name":"Grace"}',
	});
	expect(JSON.parse(run.stdout)).toMatchObject({
		status: "usage-error",
		exitCode: 2,
		errorType: "invalid-request",
	});
});

test("README JSON input cannot be repeated or mixed across source forms", async () => {
	const run = await runForTest(await app(), ["--input-json", "--format=json", "--input-json"], {
		stdin: '{"name":"Ada"}',
	});
	expect(JSON.parse(run.stdout)).toMatchObject({
		status: "usage-error",
		exitCode: 2,
		errorType: "invalid-request",
	});
});
