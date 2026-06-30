import { lstat, readFile, readlink, realpath } from "node:fs/promises";
import path from "node:path";

import { formatErrorMessage } from "@sdl/core/primitives";

import type { AregErrorInfo, AregPathState, AregTextFileState } from "../gateways.ts";
import { errorInfo } from "./errors.ts";

interface ResolveAllowedTargetOptions {
	projectRoot: string;
	relativePath: string;
	isAllowedRelativePath: (relativePath: string) => boolean;
	errorCode: string;
	shouldCheckUnsupportedFirst: boolean;
	unsupportedMessage: (relativePath: string) => string;
	unsafeMessage: (relativePath: string) => string;
	outsideMessage: (relativePath: string) => string;
}

interface SkillKindWriteTargetValidationOptions {
	target: string;
	projectRoot: string;
	shouldCreateParent: boolean;
	description: string;
}

interface ValidateTextWriteTargetOptions {
	target: string;
	projectRoot: string;
	description: string;
	shouldCreateParent: boolean;
	symlinkCode: string;
	notFileCode: string;
	parentSymlinkCode: string;
	parentNotDirectoryCode: string;
	parentMissingCode: string;
}

type WriteTargetValidationResult = { ok: true } | { ok: false; error: AregErrorInfo };

export async function inspectPath(candidate: string): Promise<AregPathState> {
	try {
		const info = await lstat(candidate);
		if (info.isSymbolicLink()) return { type: "symlink", target: await readlink(candidate) };
		if (info.isDirectory()) return { type: "directory" };
		if (info.isFile()) return { type: "file" };
		return { type: "other" };
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT")) return { type: "missing" };
		return { type: "other" };
	}
}

export async function inspectTextFile(candidate: string): Promise<AregTextFileState> {
	const pathState = await inspectPath(candidate);
	if (
		pathState.type === "missing" ||
		pathState.type === "directory" ||
		pathState.type === "symlink" ||
		pathState.type === "other"
	)
		return pathState;
	try {
		return { type: "file", text: await readFile(candidate, "utf8") };
	} catch (error) {
		return { type: "unreadable", message: formatErrorMessage(error) };
	}
}

export async function resolveExistingDirectory(
	candidate: string,
	description: string,
): Promise<{ type: "ok"; value: string } | { type: "error"; error: AregErrorInfo }> {
	const state = await inspectPath(candidate);
	if (state.type === "symlink")
		return {
			type: "error",
			error: errorInfo(
				"init-symlink",
				`${description} at ${candidate} is a symlink; refusing to manage it.`,
			),
		};
	if (state.type !== "directory")
		return {
			type: "error",
			error: errorInfo("init-not-directory", `${candidate} exists but is not a directory.`),
		};
	try {
		return { type: "ok", value: await realpath(candidate) };
	} catch (error) {
		return {
			type: "error",
			error: errorInfo(
				"init-realpath-failed",
				`Could not resolve ${description} at ${candidate}: ${formatErrorMessage(error)}`,
			),
		};
	}
}

export function resolveAllowedInitTarget(
	projectRoot: string,
	write: { relativePath: string },
): { type: "ok"; value: string } | { type: "error"; error: AregErrorInfo } {
	return resolveAllowedProjectTarget({
		projectRoot,
		relativePath: write.relativePath,
		isAllowedRelativePath: isAllowedInitRelativePath,
		errorCode: "init-write-target-refused",
		shouldCheckUnsupportedFirst: true,
		unsupportedMessage: (relativePath) =>
			`Refusing to write unsupported init target: ${relativePath}`,
		unsafeMessage: (relativePath) => `Refusing to write unsafe init target: ${relativePath}`,
		outsideMessage: (relativePath) => `Refusing to write outside project root: ${relativePath}`,
	});
}

export function resolveAllowedSkillKindTarget(
	projectRoot: string,
	relativePath: string,
	description: string,
): { type: "ok"; value: string } | { type: "error"; error: AregErrorInfo } {
	return resolveAllowedProjectTarget({
		projectRoot,
		relativePath,
		isAllowedRelativePath: isAllowedSkillKindRelativePath,
		errorCode: "skill-kind-target-refused",
		shouldCheckUnsupportedFirst: false,
		unsupportedMessage: (candidate) =>
			`Refusing to manage unsupported ${description} target: ${candidate}`,
		unsafeMessage: (candidate) => `Refusing to manage unsafe ${description} target: ${candidate}`,
		outsideMessage: (candidate) =>
			`Refusing to manage ${description} outside project root: ${candidate}`,
	});
}

function resolveAllowedProjectTarget(
	options: ResolveAllowedTargetOptions,
): { type: "ok"; value: string } | { type: "error"; error: AregErrorInfo } {
	if (options.shouldCheckUnsupportedFirst && !options.isAllowedRelativePath(options.relativePath)) {
		return {
			type: "error",
			error: errorInfo(options.errorCode, options.unsupportedMessage(options.relativePath)),
		};
	}
	if (path.isAbsolute(options.relativePath) || options.relativePath.split("/").includes("..")) {
		return {
			type: "error",
			error: errorInfo(options.errorCode, options.unsafeMessage(options.relativePath)),
		};
	}
	if (
		!options.shouldCheckUnsupportedFirst &&
		!options.isAllowedRelativePath(options.relativePath)
	) {
		return {
			type: "error",
			error: errorInfo(options.errorCode, options.unsupportedMessage(options.relativePath)),
		};
	}
	const target = path.join(options.projectRoot, ...options.relativePath.split("/"));
	const relative = path.relative(options.projectRoot, target);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		return {
			type: "error",
			error: errorInfo(options.errorCode, options.outsideMessage(options.relativePath)),
		};
	}
	return { type: "ok", value: target };
}

function isAllowedInitRelativePath(relativePath: string): boolean {
	return ["sdl.toml", "AGENTS.md", "CLAUDE.md", ".claude/settings.local.json"].includes(
		relativePath,
	);
}

function isAllowedSkillKindRelativePath(relativePath: string): boolean {
	if (relativePath === ".pi/settings.json") return true;
	const parts = relativePath.split("/");
	return (
		isAllowedSkillKindRelativePathParts(parts, 1) || isAllowedSkillKindRelativePathParts(parts, 2)
	);
}

function isAllowedSkillKindRelativePathParts(parts: readonly string[], rootLength: 1 | 2): boolean {
	const isLocalRoot = rootLength === 1 && parts[0] === "skills";
	const isVendoredRoot = rootLength === 2 && parts[0] === ".agents" && parts[1] === "skills";
	if (!isLocalRoot && !isVendoredRoot) return false;
	return (
		(parts.length === rootLength + 2 && parts[rootLength + 1] === "SKILL.md") ||
		(parts.length === rootLength + 3 &&
			parts[rootLength + 1] === "agents" &&
			parts[rootLength + 2] === "openai.yaml") ||
		(parts.length === rootLength + 2 && parts[rootLength + 1] === "agents")
	);
}

export async function validateInitWriteTarget(
	target: string,
	projectRoot: string,
	write: { description: string; createParent: boolean },
): Promise<WriteTargetValidationResult> {
	return await validateTextWriteTarget({
		target,
		projectRoot,
		description: write.description,
		shouldCreateParent: write.createParent,
		symlinkCode: "init-symlink",
		notFileCode: "init-not-file",
		parentSymlinkCode: "init-parent-symlink",
		parentNotDirectoryCode: "init-parent-not-directory",
		parentMissingCode: "init-parent-missing",
	});
}

export async function validateSkillKindWriteTarget(
	options: SkillKindWriteTargetValidationOptions,
): Promise<WriteTargetValidationResult> {
	return await validateTextWriteTarget({
		...options,
		symlinkCode: "skill-kind-symlink",
		notFileCode: "skill-kind-not-file",
		parentSymlinkCode: "skill-kind-parent-symlink",
		parentNotDirectoryCode: "skill-kind-parent-not-directory",
		parentMissingCode: "skill-kind-parent-missing",
	});
}

async function validateTextWriteTarget(
	options: ValidateTextWriteTargetOptions,
): Promise<WriteTargetValidationResult> {
	const targetState = await inspectPath(options.target);
	if (targetState.type === "symlink")
		return {
			ok: false,
			error: errorInfo(
				options.symlinkCode,
				`${options.description} at ${options.target} is a symlink; refusing to manage it.`,
			),
		};
	if (targetState.type === "directory" || targetState.type === "other")
		return {
			ok: false,
			error: errorInfo(options.notFileCode, `${options.target} exists but is not a file.`),
		};
	if (targetState.type === "file")
		return await requirePathAtOrBelow(options.target, options.projectRoot, options.description);
	const parent = await nearestExistingParent(
		options.target,
		options.projectRoot,
		options.parentMissingCode,
	);
	if (parent.type === "error") return { ok: false, error: parent.error };
	const parentState = await inspectPath(parent.value);
	if (parentState.type === "symlink")
		return {
			ok: false,
			error: errorInfo(
				options.parentSymlinkCode,
				`Parent directory at ${parent.value} is a symlink; refusing to manage it.`,
			),
		};
	if (parentState.type !== "directory")
		return {
			ok: false,
			error: errorInfo(
				options.parentNotDirectoryCode,
				`${parent.value} exists but is not a directory.`,
			),
		};
	const parentCheck = await requirePathAtOrBelow(
		parent.value,
		options.projectRoot,
		"Parent directory",
	);
	if (!parentCheck.ok) return parentCheck;
	if (!options.shouldCreateParent && path.dirname(options.target) !== parent.value) {
		return {
			ok: false,
			error: errorInfo(
				options.parentMissingCode,
				`Parent directory at ${path.dirname(options.target)} does not exist.`,
			),
		};
	}
	return { ok: true };
}

export async function validateSkillKindDeleteTarget(
	target: string,
	projectRoot: string,
	description: string,
): Promise<WriteTargetValidationResult> {
	const targetState = await inspectPath(target);
	if (targetState.type === "missing")
		return {
			ok: false,
			error: errorInfo("skill-kind-delete-missing", `${description} at ${target} does not exist.`),
		};
	if (targetState.type === "symlink")
		return {
			ok: false,
			error: errorInfo(
				"skill-kind-symlink",
				`${description} at ${target} is a symlink; refusing to delete it.`,
			),
		};
	if (targetState.type !== "file")
		return {
			ok: false,
			error: errorInfo("skill-kind-not-file", `${target} exists but is not a file.`),
		};
	return await requirePathAtOrBelow(target, projectRoot, description);
}

export async function validateSkillKindRemoveDirTarget(
	target: string,
	projectRoot: string,
	description: string,
): Promise<{ ok: true; exists: boolean } | { ok: false; error: AregErrorInfo }> {
	const targetState = await inspectPath(target);
	if (targetState.type === "missing") return { ok: true, exists: false };
	if (targetState.type === "symlink")
		return {
			ok: false,
			error: errorInfo(
				"skill-kind-symlink",
				`${description} at ${target} is a symlink; refusing to remove it.`,
			),
		};
	if (targetState.type !== "directory")
		return {
			ok: false,
			error: errorInfo("skill-kind-not-directory", `${target} exists but is not a directory.`),
		};
	const pathCheck = await requirePathAtOrBelow(target, projectRoot, description);
	if (!pathCheck.ok) return pathCheck;
	return { ok: true, exists: true };
}

async function nearestExistingParent(
	target: string,
	projectRoot: string,
	parentMissingCode: string,
): Promise<{ type: "ok"; value: string } | { type: "error"; error: AregErrorInfo }> {
	let current = path.dirname(target);
	while (current !== projectRoot) {
		const state = await inspectPath(current);
		if (state.type !== "missing") return { type: "ok", value: current };
		const parent = path.dirname(current);
		if (parent === current)
			return {
				type: "error",
				error: errorInfo(parentMissingCode, `Parent directory at ${current} does not exist.`),
			};
		current = parent;
	}
	return { type: "ok", value: projectRoot };
}

async function requirePathAtOrBelow(
	candidate: string,
	projectRoot: string,
	description: string,
): Promise<WriteTargetValidationResult> {
	try {
		const resolved = await realpath(candidate);
		if (isPathAtOrBelow(resolved, projectRoot)) return { ok: true };
		return {
			ok: false,
			error: errorInfo(
				"init-outside-project",
				`${description} at ${candidate} resolves outside ${projectRoot}; refusing to manage it.`,
			),
		};
	} catch (error) {
		return {
			ok: false,
			error: errorInfo(
				"init-realpath-failed",
				`Could not resolve ${description} at ${candidate}: ${formatErrorMessage(error)}`,
			),
		};
	}
}

function isPathAtOrBelow(candidate: string, root: string): boolean {
	const relative = path.relative(root, candidate);
	return (
		relative === "" ||
		(relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

export function isNodeErrorCode(error: unknown, code: string): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === code
	);
}
