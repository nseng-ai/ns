import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { parseJsonOutput, runCliWithFakes, type RunWithFakesOptions } from "./sdl-cli-fakes.ts";

const tempDirs: string[] = [];

const HANDOFF_COMMANDS = [
	{ name: "list", summary: "List pending handoffs.", description: "List stored handoffs." },
	{ name: "create", summary: "Create a handoff stub.", description: "Create a new handoff entry." },
	{ name: "delete", summary: "Delete a handoff.", description: "Delete a stored handoff." },
	{
		name: "gc",
		summary: "Garbage-collect handoffs.",
		description: "Garbage-collect expired handoffs.",
	},
	{ name: "pickup", summary: "Pickup a handoff.", description: "Pickup a stored handoff." },
];

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("handoff CLI grouped command contract", () => {
	test("root help surfaces the handoff group without loading leaves", async () => {
		const project = await createHandoffProject();
		clearLoadLog(project.loadLogPath);

		const run = runHandoffCli({ args: ["--help"], cwd: project.cwd });
		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("handoff");
		expect(help).toContain("SDL handoff commands.");
		expect(run.stderr.join("")).toBe("");
		expect(readLoadLog(project.loadLogPath)).toEqual([]);
	});

	test("handoff group help lists manifest leaves without importing modules", async () => {
		const project = await createHandoffProject();
		clearLoadLog(project.loadLogPath);

		const run = runHandoffCli({
			args: ["handoff", "--help"],
			cwd: project.cwd,
		});
		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("list");
		expect(help).toContain("create");
		expect(help).toContain("pickup");
		expect(run.stderr.join("")).toBe("");
		expect(readLoadLog(project.loadLogPath)).toEqual([]);
	});

	test("selected handoff leaves load only the requested module for help and schema", async () => {
		const project = await createHandoffProject();

		clearLoadLog(project.loadLogPath);
		const helpRun = runHandoffCli({
			args: ["handoff", "list", "--help"],
			cwd: project.cwd,
		});
		expect(await helpRun.exit).toBe(0);
		expect(helpRun.stdout.join("")).toContain("Usage: sdl handoff list");
		expect(helpRun.stderr.join("")).toBe("");
		expect(readLoadLog(project.loadLogPath)).toEqual(["list"]);

		clearLoadLog(project.loadLogPath);
		const schemaRun = runHandoffCli({
			args: ["handoff", "create", "--json-schema"],
			cwd: project.cwd,
		});
		expect(await schemaRun.exit).toBe(0);
		expect(parseJsonOutput(schemaRun)).toHaveProperty("inputJsonSchema");
		expect(schemaRun.stderr.join("")).toBe("");
		expect(readLoadLog(project.loadLogPath)).toEqual(["create"]);
	});

	test("unknown handoff leaves surface the unknown command diagnostic", async () => {
		const project = await createHandoffProject();
		clearLoadLog(project.loadLogPath);

		const run = runHandoffCli({
			args: ["handoff", "missing"],
			cwd: project.cwd,
		});
		expect(await run.exit).not.toBe(0);
		const error = run.stderr.join("");
		expect(error).toContain("error: unknown command 'missing'");
		expect(readLoadLog(project.loadLogPath)).toEqual([]);
	});
});

async function createHandoffProject(): Promise<{ cwd: string; loadLogPath: string }> {
	const cwd = await mkdtemp(join(tmpdir(), "sdl-handoff-contract-"));
	tempDirs.push(cwd);
	const extensionDir = join(cwd, ".sdl", "extensions", "handoff");
	mkdirSync(join(extensionDir, "src"), { recursive: true });
	const manifest = {
		sdl: {
			group: "handoff",
			commands: HANDOFF_COMMANDS.map((command) => ({
				name: command.name,
				description: command.description,
				entry: `./src/${command.name}.ts`,
			})),
		},
	};
	writeFileSync(join(extensionDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
	for (const command of HANDOFF_COMMANDS) {
		writeFileSync(
			join(extensionDir, "src", `${command.name}.ts`),
			handoffCommandSource({
				name: command.name,
				summary: command.summary,
				description: command.description,
				...(command.name === "create"
					? {
							resultSchemaExpression:
								'z.object({ status: z.literal("ok"), command: z.literal("create"), identifier: z.string() })',
						}
					: {}),
			}),
		);
	}
	const loadLogPath = join(extensionDir, "load-log.txt");
	return { cwd, loadLogPath };
}

function handoffCommandSource(options: {
	name: string;
	summary: string;
	description: string;
	schemaExpression?: string;
	resultSchemaExpression?: string;
}): string {
	const schemaExpression =
		options.schemaExpression ??
		'z.object({ scope: z.enum(["pending", "all"]).default("pending") })';
	const defaultResultSchema = `z.object({ status: z.literal(\"ok\"), command: z.literal(${JSON.stringify(options.name)}) })`;
	const resultSchemaExpression = options.resultSchemaExpression ?? defaultResultSchema;
	return `import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineExtension, ok, z } from "sdl-sdk";

const LOAD_LOG_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "load-log.txt");

function recordLoad() {
\tappendFileSync(LOAD_LOG_PATH, ${JSON.stringify(options.name)} + "\\n");
}

recordLoad();

export default defineExtension({
\tcommands: [{
\t\tname: ${JSON.stringify(options.name)},
\t\tsummary: ${JSON.stringify(options.summary)},
\t\tdescription: ${JSON.stringify(options.description)},
\t\tschema: ${schemaExpression},
\t\tresultSchema: ${resultSchemaExpression},
\t\trun() {
\t\t\treturn ok(${JSON.stringify(`${options.name} complete`)});
\t\t},
\t}],
});
`;
}

function runHandoffCli(options: RunWithFakesOptions) {
	return runCliWithFakes(
		{
			args: options.args,
			cwd: options.cwd,
			...(options.env === undefined ? {} : { env: options.env }),
			state: options.state ?? { exec: [] },
		},
		{
			execResponses: () => [],
			textGenerationResults: () => [],
			missingTextGenerationResult: () => ({ ok: false, error: "unexpected model call" }),
		},
	);
}

function readLoadLog(loadLogPath: string): string[] {
	if (!existsSync(loadLogPath)) return [];
	const trimmed = readFileSync(loadLogPath, "utf8").trim();
	if (trimmed === "") return [];
	return trimmed
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "");
}

function clearLoadLog(loadLogPath: string): void {
	if (!existsSync(loadLogPath)) return;
	rmSync(loadLogPath);
}
