import { join } from "node:path";

import { failure, ok, usageError, type ClinkrExit } from "@nseng-ai/clinkr";
import { z } from "zod";

import type { NsDevCliContext } from "../context.ts";
import {
	collectPackageDirs,
	commandSummarySchema,
	newestTarball,
	packagePathIsLocalPackage,
	readJsonObject,
	resolvePath,
	runTrackedCommand,
	scriptField,
	stringField,
	tarballName,
	type CommandSummary,
} from "../shared.ts";

export const installLocalNsExtensionRequestSchema = z.object({
	target: z.string().optional().describe("Target project directory containing package.json."),
	package: z
		.string()
		.optional()
		.describe("Local extension package path or workspace package name."),
	nsWorktree: z
		.string()
		.optional()
		.describe("ns worktree used to resolve package names; defaults to cwd."),
	packDir: z.string().optional().describe("Directory for generated npm tarballs."),
	forcePackDir: z.boolean().optional().describe("Remove --pack-dir before packing."),
	saveDev: z.boolean().optional().describe("Install as a dev dependency. Default."),
	saveProd: z.boolean().optional().describe("Install as a production dependency."),
});

export const installLocalNsExtensionResultSchema = z.object({
	targetPath: z.string(),
	packageName: z.string(),
	packagePath: z.string(),
	packageVersion: z.string(),
	tarballPath: z.string(),
	dependencyType: z.enum(["dev", "prod"]),
	commands: z.array(commandSummarySchema),
});

type InstallLocalNsExtensionRequest = z.output<typeof installLocalNsExtensionRequestSchema>;
type InstallLocalNsExtensionResult = z.output<typeof installLocalNsExtensionResultSchema>;

export async function runInstallLocalNsExtension(
	context: NsDevCliContext,
	request: InstallLocalNsExtensionRequest,
): Promise<ClinkrExit<InstallLocalNsExtensionResult>> {
	try {
		return await runInstallLocalNsExtensionInner(context, request);
	} catch (error) {
		return failure("filesystem-error", "Filesystem operation failed.", {
			message: formatUnknownError(error),
		});
	}
}

async function runInstallLocalNsExtensionInner(
	context: NsDevCliContext,
	request: InstallLocalNsExtensionRequest,
): Promise<ClinkrExit<InstallLocalNsExtensionResult>> {
	if (request.target === undefined) {
		return usageError("Missing required --target <path>.", { argument: "--target" });
	}
	if (request.package === undefined) {
		return usageError("Missing required --package <path-or-name>.", { argument: "--package" });
	}
	if (request.saveDev === true && request.saveProd === true) {
		return usageError("--save-dev and --save-prod are mutually exclusive.", {
			arguments: ["--save-dev", "--save-prod"],
		});
	}

	const nsWorktree = resolvePath(request.nsWorktree ?? context.cwd, context);
	const targetPath = resolvePath(request.target, context);
	const packDir = resolvePath(
		request.packDir ?? join(nsWorktree, "tmp", "local-npm-packs"),
		context,
	);
	const dependencyType = request.saveProd === true ? "prod" : "dev";

	if (!(await context.fs.exists(join(targetPath, "package.json")))) {
		return usageError(`Target must contain package.json: ${targetPath}.`, {
			argument: "--target",
			targetPath,
		});
	}

	const packageResolution = await resolveExtensionPackage(context, nsWorktree, request.package);
	if (packageResolution.type === "error") {
		return usageError(packageResolution.message, {
			argument: "--package",
			packageRef: request.package,
		});
	}
	const packagePath = packageResolution.packagePath;
	if (!packagePathIsLocalPackage(nsWorktree, packagePath)) {
		return usageError(`Package is not under this ns worktree's ts/packages tree: ${packagePath}.`, {
			argument: "--package",
			packagePath,
		});
	}

	const packageJsonPath = join(packagePath, "package.json");
	const packageJson = await readJsonObject(context.fs, packageJsonPath);
	if (packageJson.type === "error") return failure("package-json-error", packageJson.message);
	const packageName = stringField(packageJson.value, "name");
	const packageVersion = stringField(packageJson.value, "version");
	if (packageName === undefined || packageVersion === undefined) {
		return failure(
			"package-json-error",
			`Expected ${packageJsonPath} to contain name and version.`,
		);
	}

	if (request.forcePackDir === true) await context.fs.rmrf(packDir);
	await context.fs.mkdirp(packDir);

	const commands: CommandSummary[] = [];
	const sinceMs = context.clock.nowMs();
	const packScript = scriptField(packageJson.value, "pack:local");
	if (packScript !== undefined) {
		const packed = await runTrackedCommand(
			context,
			"pnpm",
			["--dir", join(nsWorktree, "ts"), "--filter", packageName, "run", "pack:local"],
			nsWorktree,
		);
		if (packed.type === "failed") return failure("subprocess-failed", packed.message, packed.data);
		commands.push(packed.summary);

		const generated = await newestTarball(context.fs, join(packagePath, "dist"), sinceMs);
		if (generated.type === "error") return failure("tarball-not-found", generated.message);
		await context.fs.copyFile(generated.path, join(packDir, tarballName(generated.path)));
	} else {
		const packed = await runTrackedCommand(
			context,
			"npm",
			["pack", packagePath, "--pack-destination", packDir],
			nsWorktree,
		);
		if (packed.type === "failed") return failure("subprocess-failed", packed.message, packed.data);
		commands.push(packed.summary);
	}

	const tarball = await newestTarball(context.fs, packDir, sinceMs);
	if (tarball.type === "error") return failure("tarball-not-found", tarball.message);

	const installArgs = ["install", dependencyType === "dev" ? "--save-dev" : "--save", tarball.path];
	const installed = await runTrackedCommand(context, "npm", installArgs, targetPath);
	if (installed.type === "failed")
		return failure("subprocess-failed", installed.message, installed.data);
	commands.push(installed.summary);

	await registerPackageExtension(context, targetPath, packageName);

	const rebuiltNs = await runTrackedCommand(
		context,
		"pnpm",
		["--dir", join(nsWorktree, "ts"), "--filter", "@nseng-ai/ns", "run", "pack:local"],
		nsWorktree,
	);
	if (rebuiltNs.type === "failed")
		return failure("subprocess-failed", rebuiltNs.message, rebuiltNs.data);
	commands.push(rebuiltNs.summary);

	const nsPublishPath = join(nsWorktree, "ts", "packages", "hosts", "ns-cli", "dist", "publish");
	const reinstalledNs = await runTrackedCommand(
		context,
		"npm",
		["install", "--save-dev", nsPublishPath],
		targetPath,
	);
	if (reinstalledNs.type === "failed")
		return failure("subprocess-failed", reinstalledNs.message, reinstalledNs.data);
	commands.push(reinstalledNs.summary);

	return ok({
		targetPath,
		packageName,
		packagePath,
		packageVersion,
		tarballPath: tarball.path,
		dependencyType,
		commands,
	});
}

async function registerPackageExtension(
	context: NsDevCliContext,
	targetPath: string,
	packageName: string,
): Promise<void> {
	const nsTomlPath = join(targetPath, "ns.toml");
	const extensionPath = `./node_modules/${packageName}`;
	const existing = (await context.fs.exists(nsTomlPath))
		? await context.fs.readText(nsTomlPath)
		: "";
	if (extensionIsAlreadyRegistered(existing, extensionPath)) return;
	const next = appendExtensionRegistration(existing, extensionPath);
	await context.fs.writeText(nsTomlPath, next);
}

function extensionIsAlreadyRegistered(source: string, extensionPath: string): boolean {
	return source.includes(JSON.stringify(extensionPath));
}

function appendExtensionRegistration(source: string, extensionPath: string): string {
	const line = `extensions = [${JSON.stringify(extensionPath)}]`;
	if (source.trim() === "") return `${line}\n`;
	const match = /^extensions\s*=\s*\[(?<entries>[^\]]*)\]\s*$/mu.exec(source);
	if (match?.groups?.entries === undefined) return `${source.replace(/\s*$/u, "\n")}\n${line}\n`;
	const replacement = `extensions = [${appendTomlStringEntry(match.groups.entries, extensionPath)}]`;
	return `${source.slice(0, match.index)}${replacement}${source.slice(match.index + match[0].length)}`;
}

function appendTomlStringEntry(entries: string, extensionPath: string): string {
	const trimmed = entries.trim();
	if (trimmed === "") return JSON.stringify(extensionPath);
	return `${trimmed}, ${JSON.stringify(extensionPath)}`;
}

export function renderInstallLocalNsExtension(result: InstallLocalNsExtensionResult): string {
	return [
		`Installed ${result.packageName}@${result.packageVersion} into ${result.targetPath}`,
		`Tarball: ${result.tarballPath}`,
		`Dependency type: ${result.dependencyType}`,
	].join("\n");
}

async function resolveExtensionPackage(
	context: NsDevCliContext,
	nsWorktree: string,
	packageRef: string,
): Promise<
	| { readonly type: "ok"; readonly packagePath: string }
	| { readonly type: "error"; readonly message: string }
> {
	const explicitPath = resolvePath(packageRef, context);
	if (await context.fs.exists(join(explicitPath, "package.json"))) {
		return { type: "ok", packagePath: explicitPath };
	}

	const packagesRoot = join(nsWorktree, "ts", "packages");
	if (!(await context.fs.exists(packagesRoot))) {
		return {
			type: "error",
			message: `Cannot resolve package name without packages root: ${packagesRoot}`,
		};
	}
	const matches = await collectPackageDirs(context.fs, packagesRoot);
	for (const packagePath of matches) {
		const packageJson = await readJsonObject(context.fs, join(packagePath, "package.json"));
		if (packageJson.type === "ok" && stringField(packageJson.value, "name") === packageRef) {
			return { type: "ok", packagePath };
		}
	}
	return {
		type: "error",
		message: `Could not resolve package ${packageRef} under ${packagesRoot}.`,
	};
}

function formatUnknownError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
