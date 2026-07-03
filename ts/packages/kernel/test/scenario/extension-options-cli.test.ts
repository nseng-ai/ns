import { z } from "zod";

import { describe, expect, test } from "vitest";

import type { SdlCliDeps } from "../../src/cli/index.ts";
import type {
	ExtensionCommandCandidate,
	SelectedSdlCommandLoadResult,
} from "../../src/extensions/registry.ts";
import { parseJsonOutput, runCliWithFakes } from "./ji-cli-fakes.ts";
import type { SdlCommand } from "@ji/kernel/sdk";

const optionProbeSchema = z.object({
	force: z.boolean().default(false).describe("Force the operation."),
	clipboard: z.boolean().default(true).describe("Copy output to the clipboard."),
});

const optionProbeResultSchema = z.object({
	request: z.object({
		force: z.boolean(),
		clipboard: z.boolean(),
	}),
	outputFormat: z.enum(["human", "json", "markdown"]),
});

const optionProbeCommand = {
	name: "option-probe",
	summary: "Probe extension option specs.",
	description: "Probe extension option specs.",
	schema: optionProbeSchema,
	options: {
		force: { short: "-f" },
		clipboard: { short: "-C" },
	},
	resultSchema: optionProbeResultSchema,
	async run(ctx, request) {
		return { type: "ok", data: { request, outputFormat: ctx.outputFormat ?? "human" } };
	},
} satisfies SdlCommand<typeof optionProbeSchema, z.infer<typeof optionProbeResultSchema>>;

describe("extension command option specs", () => {
	test("extension option specs render in help", async () => {
		const run = runOptionProbeCli(["option-probe", "--help"]);

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("-f, --force");
		expect(help).toContain("-C, --no-clipboard");
		expect(run.stderr.join("")).toBe("");
	});

	test("extension option specs parse boolean and negated boolean short aliases", async () => {
		const run = runOptionProbeCli(["option-probe", "-f", "-C", "--format", "json"]);

		expect(await run.exit).toBe(0);
		const envelope = parseJsonOutput(run);
		expect(envelope.status).toBe("ok");
		expect(envelope.data).toEqual({
			request: { force: true, clipboard: false },
			outputFormat: "json",
		});
		expect(run.stderr.join("")).toBe("");
	});
});

function runOptionProbeCli(args: readonly string[]) {
	return runCliWithFakes(
		{ args, extensionRegistry: optionProbeRegistry() },
		{ execResponses: () => [], textGenerationResults: () => [] },
	);
}

function optionProbeRegistry(): NonNullable<SdlCliDeps["extensionRegistry"]> {
	const candidate: ExtensionCommandCandidate = {
		name: "option-probe",
		description: "Probe extension option specs.",
		fullDescription: "Probe extension option specs.",
		source: { level: "project", label: "fake option probe extension" },
		entryPath: "fake://option-probe.ts",
		kind: "package",
	};
	return {
		async loadCommandCatalog() {
			return {
				candidates: new Map([["option-probe", candidate]]),
				commandInfos: [
					{
						name: candidate.name,
						description: candidate.description,
						fullDescription: candidate.fullDescription,
					},
				],
				diagnostics: [],
			};
		},
		async loadSelectedCommand(_candidate): Promise<SelectedSdlCommandLoadResult> {
			return {
				ok: true,
				command: optionProbeCommand,
				source: candidate.source,
				path: candidate,
			};
		},
	};
}
