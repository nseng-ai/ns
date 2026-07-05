#!/usr/bin/env bun

import { z } from "zod";

import { ClinkrGroup, failure, ok, usageError } from "@nseng-ai/clinkr";
import { defineCli, type CliEntrypointDeps } from "@nseng-ai/core/cli-runtime";

import { runRealCommand, type CommandRunner } from "./command-runner.ts";
import {
	formatNsccCmuxReportHuman,
	isNsccCmuxReportUsageFailure,
	runNsccCmuxReport,
	nsccCmuxReportData,
	nsccCmuxReportFailureData,
	nsccCmuxReportResultSchema,
} from "./cmux-report.ts";

export interface NsccCliDeps extends Pick<CliEntrypointDeps, "cwd" | "env" | "stdout" | "stderr"> {
	readonly runCommand?: CommandRunner;
	readonly startTui?: () => Promise<void> | void;
}

interface NsccCliContext {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly runCommand: CommandRunner;
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
}

const entry = defineCli<NsccCliContext, NsccCliDeps>({
	metaUrl: import.meta.url,
	runtime: "bun",
	description: "Open a full-screen OpenTUI stack map.",
	prepareRun: async ({ args, deps, cwd, env, stdout, stderr }) => {
		const context: NsccCliContext = {
			cwd: deps.cwd ?? cwd,
			env: deps.env ?? env,
			runCommand: deps.runCommand ?? runRealCommand,
			stdout: deps.stdout ?? stdout,
			stderr: deps.stderr ?? stderr,
		};
		if (args.length === 0) {
			if (deps.startTui !== undefined) {
				await deps.startTui();
			} else {
				await startDefaultTui(context);
			}
			return { type: "handled", exitCode: 0 };
		}
		return { type: "run", context, buildState: undefined };
	},
	configureCli: ({ root }) => {
		const cmuxGroup = new ClinkrGroup<NsccCliContext>({
			name: "cmux",
			description: "cmux integration helpers for nscc.",
		});
		cmuxGroup.command({
			name: "report",
			description: "Report the current git worktree identity to the current cmux surface.",
			summary: "Report branch/worktree identity into cmux surface resume metadata.",
			schema: z.object({}),
			resultSchema: nsccCmuxReportResultSchema,
			handler: async (ctx) => {
				const result = await runNsccCmuxReport({
					cwd: ctx.cwd,
					env: ctx.env,
					runCommand: ctx.runCommand,
				});
				if (result.type === "reported") return ok(nsccCmuxReportData(result.metadata));
				const data = nsccCmuxReportFailureData(result);
				if (isNsccCmuxReportUsageFailure(result.code)) return usageError(result.message, data);
				return failure(result.code, result.message, data);
			},
			renderHuman: formatNsccCmuxReportHuman,
		});
		root.group(cmuxGroup);
	},
});

export function buildCli(): ClinkrGroup<NsccCliContext> {
	return entry.buildCli(undefined);
}

export async function runNsccCli(args: readonly string[], deps: NsccCliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

async function startDefaultTui(context: NsccCliContext): Promise<void> {
	const [{ startTabHostTui }, { tabControllers }] = await Promise.all([
		import("./tabs/tab-host-renderer.ts"),
		import("./tabs/registry.ts"),
	]);
	await startTabHostTui({
		controllers: tabControllers,
		deps: { cwd: context.cwd, env: context.env, runCommand: context.runCommand },
	});
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
