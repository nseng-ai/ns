#!/usr/bin/env bun

import { z } from "zod";

import { ClinkrGroup, failure, ok, usageError } from "@ns/clinkr";
import { defineCli, type CliEntrypointDeps } from "@ns/core/cli-runtime";

import { runRealCommand, type CommandRunner } from "./command-runner.ts";
import {
	formatJiccCmuxReportHuman,
	isJiccCmuxReportUsageFailure,
	runJiccCmuxReport,
	jiccCmuxReportData,
	jiccCmuxReportFailureData,
	jiccCmuxReportResultSchema,
} from "./cmux-report.ts";

export interface JiccCliDeps extends Pick<CliEntrypointDeps, "cwd" | "env" | "stdout" | "stderr"> {
	readonly runCommand?: CommandRunner;
	readonly startTui?: () => Promise<void> | void;
}

interface JiccCliContext {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly runCommand: CommandRunner;
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
}

const entry = defineCli<JiccCliContext, JiccCliDeps>({
	metaUrl: import.meta.url,
	runtime: "bun",
	description: "Open a full-screen OpenTUI stack map.",
	prepareRun: async ({ args, deps, cwd, env, stdout, stderr }) => {
		const context: JiccCliContext = {
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
		const cmuxGroup = new ClinkrGroup<JiccCliContext>({
			name: "cmux",
			description: "cmux integration helpers for nscc.",
		});
		cmuxGroup.command({
			name: "report",
			description: "Report the current git worktree identity to the current cmux surface.",
			summary: "Report branch/worktree identity into cmux surface resume metadata.",
			schema: z.object({}),
			resultSchema: jiccCmuxReportResultSchema,
			handler: async (ctx) => {
				const result = await runJiccCmuxReport({
					cwd: ctx.cwd,
					env: ctx.env,
					runCommand: ctx.runCommand,
				});
				if (result.type === "reported") return ok(jiccCmuxReportData(result.metadata));
				const data = jiccCmuxReportFailureData(result);
				if (isJiccCmuxReportUsageFailure(result.code)) return usageError(result.message, data);
				return failure(result.code, result.message, data);
			},
			renderHuman: formatJiccCmuxReportHuman,
		});
		root.group(cmuxGroup);
	},
});

export function buildCli(): ClinkrGroup<JiccCliContext> {
	return entry.buildCli(undefined);
}

export async function runJiccCli(args: readonly string[], deps: JiccCliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

async function startDefaultTui(context: JiccCliContext): Promise<void> {
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
