import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

const REPOSITORY_ROOT = new URL("../../../../../../", import.meta.url);
const CLI_SOURCE = fileURLToPath(new URL("../../src/cli.ts", import.meta.url));
const OBJECTIVES_PACKAGE = new URL(
	"../../../../incubating/extensions/objectives/",
	import.meta.url,
);
const OBJECTIVE_ROUTES = [
	{ route: ["check"], implementation: "core/operations/check-objective.ts" },
	{ route: ["exec", "list-candidates"], implementation: "core/operations/list-candidates.ts" },
	{
		route: ["exec", "load-orientations"],
		implementation: "core/operations/load-orientations.ts",
	},
	{ route: ["exec", "publication-bind"], implementation: "ns/publication-commands.ts" },
	{ route: ["exec", "publication-publish"], implementation: "ns/publication-commands.ts" },
	{ route: ["exec", "read-objective"], implementation: "core/operations/read-objective.ts" },
	{ route: ["exec", "runner-begin"], implementation: "runner/begin.ts" },
	{ route: ["exec", "runner-finish"], implementation: "runner/finish.ts" },
	{
		route: ["exec", "runner-subagent-usage"],
		implementation: "core/operations/runner-subagent-usage.ts",
	},
	{ route: ["exec", "tracking-gate"], implementation: "core/operations/tracking-gate.ts" },
	{ route: ["list"], implementation: "core/operations/list-objectives.ts" },
	{ route: ["show"], implementation: "core/operations/show-objective.ts" },
] as const;
const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("real ns host Objectives command loading", () => {
	test.each([
		{ name: "root help", args: ["--help"] },
		{ name: "root version", args: ["--version"] },
		{ name: "root runtime", args: ["--runtime"] },
	])("$name does not load Objective command implementations", ({ args }) => {
		const run = runNsWithObjectiveImportLog(args);

		expect(run.status, run.stderr).toBe(0);
		expect(run.objectiveImplementations).toEqual([]);
	});

	test("root Objective help lists visible leaves and hides exec", () => {
		const run = runNsWithObjectiveImportLog(["objective", "--help"]);

		expect(run.status, run.stderr).toBe(0);
		expect(run.stdout).toMatch(/^  check(?:\s|$)/m);
		expect(run.stdout).toMatch(/^  list(?:\s|$)/m);
		expect(run.stdout).toMatch(/^  show(?:\s|$)/m);
		expect(run.stdout).not.toMatch(/^  exec(?:\s|$)/m);
		expect(run.objectiveImplementations).toEqual([]);
	});

	test.each(OBJECTIVE_ROUTES)("selected help loads only $route", ({ route, implementation }) => {
		const run = runNsWithObjectiveImportLog(["objective", ...route, "--help"]);

		expect(run.status, run.stderr).toBe(0);
		expect(run.stdout).toContain(`Usage: ns objective ${route.join(" ")}`);
		expect(run.objectiveImplementations).toEqual([implementation]);
	});

	test.each(OBJECTIVE_ROUTES)(
		"every Objective leaf exposes schema through the real host: $route",
		({ route, implementation }) => {
			const run = runNsWithObjectiveImportLog(["objective", ...route, "--json-schema"]);

			expect(run.status, run.stderr).toBe(0);
			expect(JSON.parse(run.stdout)).toHaveProperty("machineEnvelopeJsonSchema");
			expect(run.objectiveImplementations).toEqual([implementation]);
		},
	);

	test.each(["human", "json", "markdown", "md"] as const)(
		"renders Objective list in %s format",
		(format) => {
			const run = runNsWithObjectiveImportLog(["objective", "list", "--format", format]);

			expect(run.status, run.stderr).toBe(0);
			if (format === "json") {
				expect(JSON.parse(run.stdout)).toMatchObject({ status: "ok", exitCode: 0 });
			} else if (format === "human") {
				expect(run.stdout).toContain("Objective records in this checkout");
			} else {
				expect(run.stdout).toContain("# Objective records in this checkout");
			}
			expect(run.objectiveImplementations).toEqual(["core/operations/list-objectives.ts"]);
		},
	);

	test("invokes a hidden Objective leaf and preserves Markdown output", () => {
		const run = runNsWithObjectiveImportLog([
			"objective",
			"exec",
			"load-orientations",
			"--format",
			"md",
		]);

		expect(run.status, run.stderr).toBe(0);
		expect(run.stdout).toContain("### .ns/objectives/");
		expect(run.objectiveImplementations).toEqual(["core/operations/load-orientations.ts"]);
	});

	test("negative Objective answers use stdout and exit 1", () => {
		const run = runNsWithObjectiveImportLog(["objective", "check", "definitely-missing-objective"]);

		expect(run.status).toBe(1);
		expect(run.stdout).toContain("No Objective record found");
		expect(run.stderr).toBe("");
		expect(run.objectiveImplementations).toEqual(["core/operations/check-objective.ts"]);
	});

	test("publishes all four outcome statuses without running the selected handler", () => {
		const run = runNsWithObjectiveImportLog([
			"objective",
			"exec",
			"runner-finish",
			"--json-schema",
		]);

		expect(run.status, run.stderr).toBe(0);
		const statuses = JSON.stringify(JSON.parse(run.stdout)).match(
			/"const":"(ok|negative|failure|usageError)"/gu,
		);
		expect(new Set(statuses)).toEqual(
			new Set(['"const":"ok"', '"const":"negative"', '"const":"failure"', '"const":"usageError"']),
		);
		expect(run.stdout).not.toContain("Objective slug is required");
		expect(run.objectiveImplementations).toEqual(["runner/finish.ts"]);
	});

	test("route-name completion uses metadata without loading implementations", () => {
		const run = runNsWithObjectiveImportLog([
			"completion",
			"exec",
			"resolve",
			"--",
			"objective",
			"",
		]);

		expect(run.status, run.stderr).toBe(0);
		expect(run.stdout).toBe("check\nlist\nshow\n");
		expect(run.objectiveImplementations).toEqual([]);
	});

	test("selected option-value completion loads exactly its implementation", () => {
		const run = runNsWithObjectiveImportLog([
			"completion",
			"exec",
			"resolve",
			"--",
			"objective",
			"list",
			"--status",
			"",
		]);

		expect(run.status, run.stderr).toBe(0);
		expect(run.stdout).toBe("all\nactive\nopen\nclosed\n");
		expect(run.objectiveImplementations).toEqual(["core/operations/list-objectives.ts"]);
	});

	test("a malformed unrelated filesystem mount warns without bricking Objectives", () => {
		const project = createProjectWithMalformedUnrelatedMount();
		const run = runNsWithObjectiveImportLog(["objective", "check", "--json-schema"], project);

		expect(run.status).toBe(0);
		expect(run.stdout).toContain("machineEnvelopeJsonSchema");
		expect(run.stderr).toContain("Warning: Invalid ns extension command structure");
		expect(run.objectiveImplementations).toEqual(["core/operations/check-objective.ts"]);
	});
});

function createProjectWithMalformedUnrelatedMount(): string {
	const directory = mkdtempSync(join(tmpdir(), "ns-objective-malformed-mount-"));
	tempDirectories.push(directory);
	const extensionDirectory = join(directory, "bad-extension");
	mkdirSync(join(extensionDirectory, "src", "ns", "commands", "broken"), { recursive: true });
	writeFileSync(
		join(extensionDirectory, "package.json"),
		`${JSON.stringify({
			name: "@test/bad-objective-neighbor",
			version: "1.0.0",
			type: "module",
			exports: { "./ns-extension": "./src/ns/extension.ts" },
		})}\n`,
	);
	writeFileSync(
		join(extensionDirectory, "src", "ns", "extension.ts"),
		`import { defineExtension } from "@nseng-ai/sdk";\nexport default defineExtension({ description: "Malformed neighbor.", commandDirectory: import.meta.dirname + "/commands" });\n`,
	);
	writeFileSync(
		join(directory, "ns.toml"),
		`extensions = [${JSON.stringify(OBJECTIVES_PACKAGE.pathname)}, ${JSON.stringify(extensionDirectory)}]\n`,
	);
	return directory;
}

function runNsWithObjectiveImportLog(
	args: readonly string[],
	cwd: string | URL = REPOSITORY_ROOT,
): {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
	readonly objectiveImplementations: readonly string[];
} {
	const directory = mkdtempSync(join(tmpdir(), "ns-objective-host-"));
	tempDirectories.push(directory);
	const hookPath = join(directory, "import-log-hook.mjs");
	const logPath = join(directory, "imports.log");
	writeFileSync(
		hookPath,
		`import { appendFileSync } from "node:fs";\nimport { registerHooks } from "node:module";\nconst markers = ${JSON.stringify(OBJECTIVE_ROUTES.map(({ implementation }) => `/objectives/src/${implementation}`))};\nregisterHooks({ resolve(specifier, context, nextResolve) { const result = nextResolve(specifier, context); const isCommandImport = context.parentURL?.includes("/objectives/src/ns/objective/") && context.parentURL.endsWith("/command.ts"); if (isCommandImport && markers.some((marker) => result.url.endsWith(marker))) appendFileSync(process.env.NS_OBJECTIVE_IMPORT_LOG, result.url + "\\n"); return result; } });\n`,
		"utf8",
	);
	const result = spawnSync(process.execPath, ["--import", hookPath, CLI_SOURCE, ...args], {
		cwd,
		encoding: "utf8",
		env: { ...process.env, NS_OBJECTIVE_IMPORT_LOG: logPath },
	});
	let importLog = "";
	try {
		importLog = readFileSync(logPath, "utf8");
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
	}
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
		objectiveImplementations: [
			...new Set(
				importLog
					.split("\n")
					.filter((line) => line !== "")
					.map((line) =>
						line.slice(line.lastIndexOf("/objectives/src/") + "/objectives/src/".length),
					),
			),
		],
	};
}
