import { join } from "node:path";

import { failure, ok, usageError, type ClinkrExit } from "@nseng-ai/clinkr";
import { z } from "zod";

import type { NsDevCliContext } from "../context.ts";
import {
	commandRefFrom,
	commandRefSchema,
	commandSummarySchema,
	guardFilesystemErrors,
	readVerifiedNsPackage,
	resolvePath,
	runTrackedCommand,
	trackedCommandFailureExit,
	type CommandSummary,
	type CommandRef,
} from "../shared.ts";

export const createLocalNsProjectRequestSchema = z.object({
	nsWorktree: z.string().optional().describe("Path to the ns worktree to install from. Required."),
	parent: z.string().optional().describe("Parent directory for the new local development project."),
	name: z.string().optional().describe("New project folder name."),
	force: z.boolean().optional().describe("Remove an existing destination before creation."),
	skipVerify: z.boolean().optional().describe("Skip post-install npx ns verification commands."),
});

const verificationPassedSchema = commandRefSchema;

export const createLocalNsProjectResultSchema = z.object({
	projectPath: z.string(),
	projectName: z.string(),
	nsWorktree: z.string(),
	nsPackageVersion: z.string(),
	publishPath: z.string(),
	verification: z.union([z.literal("skipped"), z.array(verificationPassedSchema)]),
	nextCommands: z.array(z.string()),
	commands: z.array(commandSummarySchema),
});

type CreateLocalNsProjectRequest = z.output<typeof createLocalNsProjectRequestSchema>;
type CreateLocalNsProjectResult = z.output<typeof createLocalNsProjectResultSchema>;
type VerificationPassed = CommandRef;

export async function runCreateLocalNsProject(
	context: NsDevCliContext,
	request: CreateLocalNsProjectRequest,
): Promise<ClinkrExit<CreateLocalNsProjectResult>> {
	return guardFilesystemErrors(() => runCreateLocalNsProjectInner(context, request));
}

async function runCreateLocalNsProjectInner(
	context: NsDevCliContext,
	request: CreateLocalNsProjectRequest,
): Promise<ClinkrExit<CreateLocalNsProjectResult>> {
	if (request.nsWorktree === undefined) {
		return usageError("Missing required --ns-worktree <path>.", { argument: "--ns-worktree" });
	}

	const nsWorktree = resolvePath(request.nsWorktree, context);
	const parent = resolvePath(request.parent ?? "~/code/scratch/ns-integration-runs", context);
	const projectName = request.name ?? `ns-local-project-${timestampForPath(context.clock.nowMs())}`;
	const projectPath = join(parent, projectName);
	const nsPackageRoot = join(nsWorktree, "ts", "packages", "hosts", "ns-cli");
	const sourcePackageJsonPath = join(nsPackageRoot, "package.json");
	const publishPath = join(nsPackageRoot, "dist", "publish");
	const publishPackageJsonPath = join(publishPath, "package.json");

	const sourcePackageJson = await readVerifiedNsPackage(context.fs, sourcePackageJsonPath);
	if (sourcePackageJson.type === "error") {
		return failure("ns-package-not-found", sourcePackageJson.message);
	}

	if (await context.fs.exists(projectPath)) {
		if (request.force !== true) {
			return usageError(
				`Destination already exists: ${projectPath}. Pass --force to remove it first.`,
				{
					argument: "--force",
					projectPath,
				},
			);
		}
	}

	const commands: CommandSummary[] = [];
	const pack = await runTrackedCommand(context, {
		command: "pnpm",
		args: ["--dir", join(nsWorktree, "ts"), "--filter", "@nseng-ai/ns", "run", "pack:local"],
		cwd: nsWorktree,
	});
	if (pack.type === "failed") return trackedCommandFailureExit(pack);
	commands.push(pack.summary);

	const publishPackageJson = await readVerifiedNsPackage(context.fs, publishPackageJsonPath);
	if (publishPackageJson.type === "error") {
		return failure("publish-package-not-found", publishPackageJson.message);
	}
	if (publishPackageJson.value.version !== sourcePackageJson.value.version) {
		return failure(
			"publish-package-version-mismatch",
			`Fresh package version mismatch: source ${sourcePackageJson.value.version}, publish ${publishPackageJson.value.version}.`,
		);
	}

	if (request.force === true && (await context.fs.exists(projectPath))) {
		await context.fs.rmrf(projectPath);
	}

	await context.fs.mkdirp(projectPath);
	await context.fs.writeText(
		join(projectPath, "README.md"),
		`# ${projectName}\n\nLocal ns development bootstrap project.\n`,
	);
	await context.fs.writeText(join(projectPath, ".gitignore"), renderJavaScriptGitignore());

	for (const step of [
		{ command: "git", args: ["init", "-b", "main", "."] },
		{ command: "npm", args: ["init", "-y"] },
		{ command: "npm", args: ["install", "--save-dev", publishPath] },
		{
			command: "git",
			args: ["add", ".gitignore", "README.md", "package.json", "package-lock.json"],
		},
		{ command: "git", args: ["commit", "-m", "Initial commit"] },
	] as const) {
		const result = await runTrackedCommand(context, {
			command: step.command,
			args: step.args,
			cwd: projectPath,
		});
		if (result.type === "failed") return trackedCommandFailureExit(result);
		commands.push(result.summary);
	}

	let verification: "skipped" | VerificationPassed[] = "skipped";
	if (request.skipVerify !== true) {
		verification = [];
		for (const args of [
			["ns", "--help"],
			["ns", "init", "--help"],
			["ns", "skills", "list"],
			["ns", "extension", "points"],
		] as const) {
			const result = await runTrackedCommand(context, {
				command: "npx",
				args,
				cwd: projectPath,
			});
			if (result.type === "failed") {
				return failure("verification-failed", result.message, {
					failedCommand: commandRefFrom(result.summary),
					...result.data,
				});
			}
			commands.push(result.summary);
			verification.push(commandRefFrom({ command: "npx", args, cwd: projectPath }));
		}
	}

	return ok({
		projectPath,
		projectName,
		nsWorktree,
		nsPackageVersion: sourcePackageJson.value.version,
		publishPath,
		verification,
		nextCommands: [`cd ${projectPath}`, "npx ns init --harness claude-code"],
		commands,
	});
}

export function renderCreateLocalNsProject(result: CreateLocalNsProjectResult): string {
	return [
		`Ready: ${result.projectPath}`,
		`Installed @nseng-ai/ns@${result.nsPackageVersion}`,
		`Verification: ${result.verification === "skipped" ? "skipped" : `${result.verification.length} commands passed`}`,
		"Next:",
		...result.nextCommands.map((command) => `  ${command}`),
	].join("\n");
}

function renderJavaScriptGitignore(): string {
	return [
		"node_modules/",
		"dist/",
		"coverage/",
		".ns/managed-extensions/",
		".npm/",
		"npm-debug.log*",
		"yarn-debug.log*",
		"yarn-error.log*",
		"pnpm-debug.log*",
		".DS_Store",
		".env",
		".env.*",
		"",
	].join("\n");
}

function timestampForPath(nowMs: number): string {
	return new Date(nowMs)
		.toISOString()
		.replaceAll(/[-:.TZ]/gu, "")
		.slice(0, 14);
}
