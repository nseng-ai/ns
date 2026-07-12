import type { Caps } from "@nseng-ai/clinkr";
import { z } from "zod";

import { describe, expect, test } from "vitest";

import type { NsCliDeps } from "../../src/cli/index.ts";
import type {
	ExtensionCommandCandidate,
	SelectedNsCommandLoadResult,
} from "../../src/extensions/registry.ts";
import { parseJsonOutput, runCliWithFakes } from "./ns-cli-fakes.ts";
import {
	defineCommand,
	defineRawCommand,
	ok,
	type NsCommand,
	type NsProgressPhaseEvent,
} from "@nseng-ai/sdk";

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

const progressProbeSchema = z.object({});
const progressProbeResultSchema = z.object({ isLive: z.boolean() });
const homeDirProbeSchema = z.object({});
const homeDirProbeResultSchema = z.object({ homeDir: z.string().optional() });

const colorCaps: Caps = {
	isTty: true,
	colorDepth: "truecolor",
	columns: 80,
	canRenderUnicode: true,
};

const colorProbeCommand = defineRawCommand({
	name: "color-probe",
	summary: "Probe raw extension color output.",
	description: "Probe raw extension color output.",
	run: () => ok({}, { human: "\u001b[31mcolored\u001b[0m" }),
});

const optionProbeCommand = defineCommand({
	name: "option-probe",
	summary: "Probe extension option specs.",
	description: "Probe extension option specs.",
	schema: optionProbeSchema,
	options: {
		force: { short: "-f" },
		clipboard: { short: "-C" },
	},
	resultSchema: optionProbeResultSchema,
	handler: async (ctx, request) => ({
		type: "ok",
		data: { request, outputFormat: ctx.outputFormat ?? "human" },
	}),
}) satisfies NsCommand<typeof optionProbeSchema, z.infer<typeof optionProbeResultSchema>>;

const homeDirProbeCommand = defineCommand({
	name: "home-dir-probe",
	summary: "Probe resolved home dir.",
	description: "Probe resolved home dir.",
	schema: homeDirProbeSchema,
	resultSchema: homeDirProbeResultSchema,
	handler: async (ctx) => {
		if (ctx.homeDir === undefined) return { type: "ok", data: {} };
		return { type: "ok", data: { homeDir: ctx.homeDir } };
	},
}) satisfies NsCommand<typeof homeDirProbeSchema, z.infer<typeof homeDirProbeResultSchema>>;

const progressProbeCommand = defineCommand({
	name: "progress-probe",
	summary: "Probe progress deps.",
	description: "Probe progress deps.",
	schema: progressProbeSchema,
	resultSchema: progressProbeResultSchema,
	handler: async (ctx) => {
		ctx.progress.phase({ type: "phase-started", phaseKey: "x" });
		return { type: "ok", data: { isLive: ctx.progress.isLive } };
	},
}) satisfies NsCommand<typeof progressProbeSchema, z.infer<typeof progressProbeResultSchema>>;

describe("extension command option specs", () => {
	test("runCli provides a live progress sink when onProgress is injected", async () => {
		const events: NsProgressPhaseEvent[] = [];
		const run = runProgressProbeCli({ onProgress: (event) => events.push(event) });

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ status: "ok", data: { isLive: true } });
		expect(events).toEqual([{ type: "phase-started", phaseKey: "x" }]);
	});

	test("runCli defaults progress to a safe noop sink", async () => {
		const run = runProgressProbeCli();

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ status: "ok", data: { isLive: false } });
	});

	test("runCli passes the kernel-computed home directory to command contexts", async () => {
		const run = runCliWithFakes(
			{
				args: ["home-dir-probe", "--format", "json"],
				homeDir: "/kernel/home",
				env: { HOME: undefined },
				extensionRegistry: commandRegistry(homeDirProbeCommand),
			},
			{ execResponses: () => [], textGenerationResults: () => [] },
		);

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: { homeDir: "/kernel/home" },
		});
	});

	test("raw extension emission preserves ANSI for an ANSI-capable sink", async () => {
		const run = runCliWithFakes(
			{
				args: ["color-probe"],
				renderCapabilities: { canEmitAnsi: true, caps: colorCaps },
				extensionRegistry: commandRegistry(colorProbeCommand),
			},
			{ execResponses: () => [], textGenerationResults: () => [] },
		);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("\u001b[31mcolored\u001b[0m\n");
	});

	test("raw extension emission strips ANSI when the sink disables it despite color caps", async () => {
		const run = runCliWithFakes(
			{
				args: ["color-probe"],
				renderCapabilities: { canEmitAnsi: false, caps: colorCaps },
				extensionRegistry: commandRegistry(colorProbeCommand),
			},
			{ execResponses: () => [], textGenerationResults: () => [] },
		);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("colored\n");
	});

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
		{ args, extensionRegistry: commandRegistry(optionProbeCommand) },
		{ execResponses: () => [], textGenerationResults: () => [] },
	);
}

function runProgressProbeCli(options: { onProgress?: NsCliDeps["onProgress"] } = {}) {
	return runCliWithFakes(
		{
			args: ["progress-probe", "--format", "json"],
			extensionRegistry: commandRegistry(progressProbeCommand),
			...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
		},
		{ execResponses: () => [], textGenerationResults: () => [] },
	);
}

function commandRegistry(command: NsCommand): NonNullable<NsCliDeps["extensionRegistry"]> {
	const candidate: ExtensionCommandCandidate = {
		name: command.name,
		description: command.summary,
		fullDescription: command.description,
		source: { level: "project", label: `fake ${command.name} extension` },
		moduleReference: { type: "file", path: `fake://${command.name}.ts` },
		entryPath: `fake://${command.name}.ts`,
		hasStaticCommandInfo: true,
	};
	return {
		async loadCommandCatalog() {
			return {
				candidates: new Map([[command.name, candidate]]),
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
		async loadSelectedCommand(_candidate): Promise<SelectedNsCommandLoadResult> {
			return {
				ok: true,
				command,
				source: candidate.source,
				path: candidate,
			};
		},
	};
}
