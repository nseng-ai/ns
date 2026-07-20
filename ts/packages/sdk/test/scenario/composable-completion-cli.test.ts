import type { NsCommandDefinition } from "@nseng-ai/sdk/command";
import type { NsCliDeps } from "@nseng-ai/sdk/cli";
import { describe, expect, test } from "vitest";

import type { ExtensionCommandCandidate } from "../../src/extensions/registry.ts";
import { createComposableCompletionFixtures } from "./composable-command-fixtures.ts";
import { runCliWithFakes } from "./ns-cli-fakes.ts";

const defaults = { execResponses: () => [], textGenerationResults: () => [] };

describe("ns command completion CLI", () => {
	test("resolves candidates with cwd, catalog, and an explicit fixture dependency", async () => {
		const completionLog: string[] = [];
		const fixtures = createComposableCompletionFixtures({
			completionLog,
			dependency: "fake-dependency",
		});
		const registry = completionRegistry(
			[fixtures.selected, fixtures.unrelated],
			["@example/present"],
		);
		const run = runCliWithFakes(
			{
				args: ["completion", "exec", "resolve", "--", "completion-probe", ""],
				cwd: "/completion-work",
				extensionRegistry: registry,
			},
			defaults,
		);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("").split("\n").filter(Boolean)).toEqual([
			"static-choice",
			"/completion-work",
			"catalog-present",
			"fake-dependency",
		]);
		expect(run.stderr.join("")).toBe("");
		expect(registry.loadLog).toEqual(["completion-probe"]);
		expect(completionLog).toEqual(["selected:"]);
	});

	test("loads only the selected flat ns command", async () => {
		const completionLog: string[] = [];
		const fixtures = createComposableCompletionFixtures({
			completionLog,
			dependency: "fake-dependency",
		});
		const registry = completionRegistry([fixtures.selected, fixtures.unrelated]);
		const run = runCliWithFakes(
			{
				args: ["completion", "exec", "resolve", "--", "completion-probe", "fake"],
				extensionRegistry: registry,
			},
			defaults,
		);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("fake-dependency\n");
		expect(registry.loadLog).toEqual(["completion-probe"]);
		expect(completionLog).toEqual(["selected:fake"]);
	});

	test("keeps provider failures nonfatal and preserves static candidates", async () => {
		const completionLog: string[] = [];
		const fixtures = createComposableCompletionFixtures({ completionLog, failSelected: true });
		const run = runCliWithFakes(
			{
				args: ["completion", "exec", "resolve", "--", "completion-probe", "s"],
				extensionRegistry: completionRegistry([fixtures.selected]),
			},
			defaults,
		);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("static-choice\n");
		expect(run.stderr.join("")).toBe("");
		expect(completionLog).toEqual(["selected:s"]);
	});

	test("does not invoke the dynamic provider for static option completion", async () => {
		const completionLog: string[] = [];
		const fixtures = createComposableCompletionFixtures({ completionLog });
		const run = runCliWithFakes(
			{
				args: ["completion", "exec", "resolve", "--", "completion-probe", "--"],
				extensionRegistry: completionRegistry([fixtures.selected]),
			},
			defaults,
		);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("--enabled\n");
		expect(completionLog).toEqual([]);
	});
});

function completionRegistry(
	commands: readonly NsCommandDefinition<unknown>[],
	extensionPackageNames: readonly string[] = [],
): NonNullable<NsCliDeps["extensionRegistry"]> & { loadLog: string[] } {
	const loadLog: string[] = [];
	const candidates = new Map(
		commands.map((command) => {
			const candidate: ExtensionCommandCandidate = {
				kind: "ns-command",
				name: command.name,
				description: command.summary,
				fullDescription: command.description,
				source: { level: "project", label: `fake ${command.name}` },
				moduleReference: { type: "file", path: `fake://${command.name}.ts` },
				entryPath: `fake://${command.name}.ts`,
				hasStaticCommandInfo: true,
			};
			return [command.name, candidate] as const;
		}),
	);
	return {
		loadLog,
		async loadCommandCatalog() {
			return {
				candidates,
				commandInfos: [...candidates.values()].map((candidate) => ({
					name: candidate.name,
					description: candidate.description,
					fullDescription: candidate.fullDescription,
				})),
				diagnostics: [],
				extensionPackageNames: new Set(extensionPackageNames),
			};
		},
		async loadSelectedCommand(candidate) {
			loadLog.push(candidate.name);
			const command = commands.find((entry) => entry.name === candidate.name);
			if (command === undefined) throw new Error(`Missing command ${candidate.name}.`);
			return {
				ok: true,
				loaded: { kind: "ns-command", command },
				source: candidate.source,
				path: candidate,
			};
		},
	};
}
