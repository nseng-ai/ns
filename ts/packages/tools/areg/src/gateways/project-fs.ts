import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { formatErrorMessage } from "@nseng-ai/core/primitives";

import type { AregErrorInfo, AregProjectMutationPolicy, AregTextFileState } from "../gateways.ts";
import {
	classifySkillMirrorSymlinkState,
	expectedMirrorTarget,
} from "../operations/skill-mirror-conventions.ts";
import { errorInfo } from "./errors.ts";
import { inspectPath, isPathAtOrBelow } from "./fs-utils.ts";
import { getAregProjectMutationPolicyDescriptor } from "./mutation-policy.ts";

export { inspectPath, isNodeErrorCode } from "./fs-utils.ts";

export function toProjectPath(projectRoot: string, relativePath: string): string {
	return path.join(projectRoot, ...relativePath.split("/"));
}

interface ResolveAllowedWriteTargetOptions {
	policy: AregProjectMutationPolicy;
	projectRoot: string;
	relativePath: string;
	description: string;
}

interface ValidateTextWriteTargetOptions {
	policy: AregProjectMutationPolicy;
	target: string;
	projectRoot: string;
	description: string;
	shouldCreateParent: boolean;
}

type WriteTargetValidationResult = { ok: true } | { ok: false; error: AregErrorInfo };

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

export function resolveAllowedWriteTarget(
	options: ResolveAllowedWriteTargetOptions,
): { type: "ok"; value: string } | { type: "error"; error: AregErrorInfo } {
	const descriptor = getAregProjectMutationPolicyDescriptor(options.policy);
	if (
		descriptor.shouldCheckUnsupportedFirst &&
		!descriptor.isAllowedRelativePath(options.relativePath)
	) {
		return {
			type: "error",
			error: errorInfo(
				descriptor.refusedTargetCode,
				descriptor.unsupportedMessage(options.relativePath, options.description),
			),
		};
	}
	if (path.isAbsolute(options.relativePath) || options.relativePath.split("/").includes("..")) {
		return {
			type: "error",
			error: errorInfo(
				descriptor.refusedTargetCode,
				descriptor.unsafeMessage(options.relativePath, options.description),
			),
		};
	}
	if (
		!descriptor.shouldCheckUnsupportedFirst &&
		!descriptor.isAllowedRelativePath(options.relativePath)
	) {
		return {
			type: "error",
			error: errorInfo(
				descriptor.refusedTargetCode,
				descriptor.unsupportedMessage(options.relativePath, options.description),
			),
		};
	}
	const target = toProjectPath(options.projectRoot, options.relativePath);
	const relative = path.relative(options.projectRoot, target);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		return {
			type: "error",
			error: errorInfo(
				descriptor.refusedTargetCode,
				descriptor.outsideMessage(options.relativePath, options.description),
			),
		};
	}
	return { type: "ok", value: target };
}

export async function validateWriteTarget(
	options: ValidateTextWriteTargetOptions,
): Promise<WriteTargetValidationResult> {
	const descriptor = getAregProjectMutationPolicyDescriptor(options.policy);
	const targetState = await inspectPath(options.target);
	if (targetState.type === "symlink")
		return {
			ok: false,
			error: errorInfo(
				descriptor.symlinkCode,
				`${options.description} at ${options.target} is a symlink; refusing to manage it.`,
			),
		};
	if (targetState.type === "directory" || targetState.type === "other")
		return {
			ok: false,
			error: errorInfo(descriptor.notFileCode, `${options.target} exists but is not a file.`),
		};
	if (targetState.type === "file")
		return await requirePathAtOrBelow(options.target, options.projectRoot, options.description);
	const parent = await nearestExistingParent(
		options.target,
		options.projectRoot,
		descriptor.parentMissingCode,
	);
	if (parent.type === "error") return { ok: false, error: parent.error };
	const parentState = await inspectPath(parent.value);
	if (parentState.type === "symlink")
		return {
			ok: false,
			error: errorInfo(
				descriptor.parentSymlinkCode,
				`Parent directory at ${parent.value} is a symlink; refusing to manage it.`,
			),
		};
	if (parentState.type !== "directory")
		return {
			ok: false,
			error: errorInfo(
				descriptor.parentNotDirectoryCode,
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
				descriptor.parentMissingCode,
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

/**
 * Validates a skill-mirror symlink deletion target. This is intentionally
 * narrower than the skill-kind write/delete path policy: only exact
 * `.agents/skills/<name>` / `.claude/skills/<name>` symlinks pointing at the
 * convention target are deletable, and containment is checked through the
 * parent directory's realpath (not through the link itself).
 */
export async function validateSkillKindDeleteSymlinkTarget(
	target: string,
	projectRoot: string,
	relativePath: string,
	description: string,
): Promise<WriteTargetValidationResult> {
	const expectedTarget = expectedMirrorTarget(relativePath);
	if (expectedTarget !== undefined) {
		const parentCheck = await requirePathAtOrBelow(
			path.dirname(target),
			projectRoot,
			"Parent directory",
		);
		if (!parentCheck.ok) return parentCheck;
	}
	const state = expectedTarget === undefined ? undefined : await inspectPath(target);
	const failure = classifySkillMirrorSymlinkState(relativePath, state, description, target);
	return failure === undefined ? { ok: true } : { ok: false, error: failure };
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
