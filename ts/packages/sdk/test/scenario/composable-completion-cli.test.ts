import {
	createRealFirstPartyCommandContext,
	materializeFirstPartyCommand,
} from "@nseng-ai/capability-kit";
import type { DescriptorCommand } from "@nseng-ai/sdk";
import type { NsCliDeps } from "@nseng-ai/sdk/cli";
import { describe, expect, test } from "vitest";

import type { ExtensionCommandCandidate } from "../../src/extensions/registry.ts";
import { createComposableCompletionFixtures } from "./composable-command-fixtures.ts";
import { runCliWithFakes } from "./ns-cli-fakes.ts";

const defaults = { execResponses: () => [], textGenerationResults: () => [] };

describe("composable command completion CLI", () => {
	test("resolves candidates with cwd, catalog, and the fake first-party dependency", async () => {
		const completionLog: string[] = [];
		const fixtures = createComposableCompletionFixtures({ completionLog });
		const registry = completionRegistry(
			[fixtures.selected, fixtures.unrelated],
			["@example/present"],
		);
		const run = runCliWithFakes(
			{
				args: ["completion", "exec", "resolve", "--", "completion-probe", ""],
				cwd: "/completion-work",
				env: { COMPLETION_DEPENDENCY: "fake-dependency" },
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

	test("loads and materializes only the selected command", async () => {
		const completionLog: string[] = [];
		const bindLog: string[] = [];
		const fixtures = createComposableCompletionFixtures({ completionLog });
		const registry = completionRegistry([fixtures.selected, fixtures.unrelated]);
		const run = runCliWithFakes(
			{
				args: ["completion", "exec", "resolve", "--", "completion-probe", "fake"],
				env: { COMPLETION_DEPENDENCY: "fake-dependency" },
				extensionRegistry: registry,
				bindSelectedCommand: (command) => {
					bindLog.push(command.name);
					return materializeFirstPartyCommand(command, fakeFirstPartyContext("fake-dependency"));
				},
			},
			defaults,
		);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("fake-dependency\n");
		expect(registry.loadLog).toEqual(["completion-probe"]);
		expect(bindLog).toEqual(["completion-probe"]);
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

function fakeFirstPartyContext(dependency: string) {
	return createRealFirstPartyCommandContext({
		env: { COMPLETION_DEPENDENCY: dependency },
		textGenerator: { generateText: async () => ({ ok: false, error: "unused" }) },
		commandRunner: async () => ({
			type: "exited",
			code: 0,
			signal: null,
			stdout: "",
			stderr: "",
		}),
	});
}

function completionRegistry(
	commands: readonly DescriptorCommand[],
	extensionPackageNames: readonly string[] = [],
): NonNullable<NsCliDeps["extensionRegistry"]> & { loadLog: string[] } {
	const loadLog: string[] = [];
	const candidates = new Map(
		commands.map((command) => {
			const candidate: ExtensionCommandCandidate = {
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
			return { ok: true, command, source: candidate.source, path: candidate };
		},
	};
}
