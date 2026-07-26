import { join } from "node:path";

import { failure, ok, usageError, type ClinkrExit } from "@nseng-ai/clinkr";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { z } from "zod";

import type { NsDevCliContext } from "../context.ts";
import {
	collectPackageDirs,
	commandSummarySchema,
	formatUnknownError,
	guardFilesystemErrors,
	installNsPublishPackage,
	newestTarball,
	packagePathIsLocalPackage,
	packLocalNsPackage,
	readJsonObject,
	resolvePath,
	runTrackedCommand,
	scriptField,
	stringField,
	tarballName,
	trackedCommandFailureExit,
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
): Promise<ClinkrExit<InstallLocalNsExtensionResult, unknown, unknown, unknown>> {
	return guardFilesystemErrors(() => runInstallLocalNsExtensionInner(context, request));
}

async function runInstallLocalNsExtensionInner(
	context: NsDevCliContext,
	request: InstallLocalNsExtensionRequest,
): Promise<ClinkrExit<InstallLocalNsExtensionResult, unknown, unknown, unknown>> {
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
		const packed = await runTrackedCommand(context, {
			command: "pnpm",
			args: ["--dir", join(nsWorktree, "ts"), "--filter", packageName, "run", "pack:local"],
			cwd: nsWorktree,
		});
		if (packed.type === "failed") return trackedCommandFailureExit(packed);
		commands.push(packed.summary);

		const generated = await newestTarball(context.fs, join(packagePath, "dist"), sinceMs);
		if (generated.type === "error") return failure("tarball-not-found", generated.message);
		await context.fs.copyFile(generated.value, join(packDir, tarballName(generated.value)));
	} else {
		const packed = await runTrackedCommand(context, {
			command: "npm",
			args: ["pack", packagePath, "--pack-destination", packDir],
			cwd: nsWorktree,
		});
		if (packed.type === "failed") return trackedCommandFailureExit(packed);
		commands.push(packed.summary);
	}

	const tarball = await newestTarball(context.fs, packDir, sinceMs);
	if (tarball.type === "error") return failure("tarball-not-found", tarball.message);

	const installArgs = [
		"install",
		dependencyType === "dev" ? "--save-dev" : "--save",
		tarball.value,
	];
	const installed = await runTrackedCommand(context, {
		command: "npm",
		args: installArgs,
		cwd: targetPath,
	});
	if (installed.type === "failed") return trackedCommandFailureExit(installed);
	commands.push(installed.summary);

	const registerResult = await registerPackageExtension(context, targetPath, packageName);
	if (registerResult.type === "error") return registerResult.exit;

	const rebuiltNs = await packLocalNsPackage(context, nsWorktree);
	if (rebuiltNs.type === "failed") return trackedCommandFailureExit(rebuiltNs);
	commands.push(rebuiltNs.summary);

	const reinstalledNs = await installNsPublishPackage(context, { nsWorktree, targetPath });
	if (reinstalledNs.type === "failed") return trackedCommandFailureExit(reinstalledNs);
	commands.push(reinstalledNs.summary);

	return ok({
		targetPath,
		packageName,
		packagePath,
		packageVersion,
		tarballPath: tarball.value,
		dependencyType,
		commands,
	});
}

type RegisterPackageExtensionResult =
	| { readonly type: "ok" }
	| {
			readonly type: "error";
			readonly exit: ClinkrExit<InstallLocalNsExtensionResult, unknown, unknown, unknown>;
	  };

async function registerPackageExtension(
	context: NsDevCliContext,
	targetPath: string,
	packageName: string,
): Promise<RegisterPackageExtensionResult> {
	const nsTomlPath = join(targetPath, "ns.toml");
	const extensionPath = `./node_modules/${packageName}`;
	const toml = await readNsTomlTable(context, nsTomlPath);
	if (toml.type === "error") return toml;
	const extensions = normalizeExtensionsValue(toml.table.extensions);
	if (extensions.type === "error") return invalidNsToml(nsTomlPath, extensions.message);

	const uniqueExtensions = [...new Set(extensions.value)];
	if (uniqueExtensions.includes(extensionPath)) return { type: "ok" };

	const nextToml = {
		...toml.table,
		extensions: [...uniqueExtensions, extensionPath],
	} satisfies Record<string, unknown>;
	const serialized = ensureTrailingNewline(stringifyToml(nextToml));
	await context.fs.writeText(nsTomlPath, serialized);
	return { type: "ok" };
}

async function readNsTomlTable(
	context: NsDevCliContext,
	nsTomlPath: string,
): Promise<
	| { readonly type: "ok"; readonly table: Record<string, unknown> }
	| {
			readonly type: "error";
			readonly exit: ClinkrExit<InstallLocalNsExtensionResult, unknown, unknown, unknown>;
	  }
> {
	if (!(await context.fs.exists(nsTomlPath))) return { type: "ok", table: {} };
	try {
		const text = await context.fs.readText(nsTomlPath);
		const parsed = parseToml(text);
		if (!isPlainObject(parsed)) {
			return invalidNsToml(nsTomlPath, "ns.toml must contain a TOML table.");
		}
		return { type: "ok", table: parsed as Record<string, unknown> };
	} catch (error) {
		return invalidNsToml(nsTomlPath, formatUnknownError(error));
	}
}

function normalizeExtensionsValue(
	extensions: unknown,
):
	| { readonly type: "ok"; readonly value: readonly string[] }
	| { readonly type: "error"; readonly message: string } {
	if (extensions === undefined) return { type: "ok", value: [] };
	if (!Array.isArray(extensions)) {
		return { type: "error", message: "ns.toml extensions must be an array of strings." };
	}
	const normalized: string[] = [];
	for (const entry of extensions) {
		if (typeof entry !== "string" || entry.length === 0) {
			return { type: "error", message: "ns.toml extensions must be an array of strings." };
		}
		normalized.push(entry);
	}
	return { type: "ok", value: normalized };
}

function invalidNsToml(
	path: string,
	message: string,
): Extract<RegisterPackageExtensionResult, { type: "error" }> {
	return { type: "error", exit: failure("ns-toml-invalid", "Invalid ns.toml.", { path, message }) };
}

function ensureTrailingNewline(content: string): string {
	return content.endsWith("\n") ? content : `${content}\n`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
