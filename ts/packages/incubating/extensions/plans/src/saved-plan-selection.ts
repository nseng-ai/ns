import { basename, isAbsolute } from "node:path";

import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

import { isPathInside, normalizePlanFilePath } from "./plan-persistence.ts";
import { createRealPlanStoreGateway } from "./plan-store-gateway.ts";
import {
	findLatestSavedPlanFile,
	resolvePlanStoreDirectory,
	type DurableSavedPlan,
	type LatestSavedPlanFileEvidence,
	type PlanStoreDirectoryEvidence,
	type PlanStoreOptions,
} from "./saved-plan-file.ts";
import { parseSavedPlanFileName } from "./saved-plan-format.ts";

export interface ResolveExplicitSavedPlanFileOptions extends PlanStoreOptions {
	explicitPath: string;
}

export type ResolvedExplicitSavedPlanFile = DurableSavedPlan & {
	content: string;
};

export type ExplicitSavedPlanFileResolution =
	| { type: "resolved"; plan: ResolvedExplicitSavedPlanFile }
	| { type: "not-found" | "unsafe" | "error"; message: string };

export type SelectedSavedPlanFile =
	| { type: "explicit"; plan: ResolvedExplicitSavedPlanFile }
	| { type: "latest"; plan: LatestSavedPlanFileEvidence };

export interface ResolveSelectedSavedPlanFileOptions extends PlanStoreOptions {
	explicitPath?: string;
}

export async function resolveExplicitSavedPlanFile(
	commands: CommandExecApi,
	options: ResolveExplicitSavedPlanFileOptions,
): Promise<ExplicitSavedPlanFileResolution> {
	let directory: PlanStoreDirectoryEvidence;
	try {
		directory = await resolvePlanStoreDirectory(commands, options);
	} catch (error) {
		return { type: "error", message: formatErrorMessage(error) };
	}

	const filePath = normalizePlanFilePath(options.explicitPath);
	if (!isAbsolute(filePath)) {
		return unsafe(
			`Saved Plan path must be absolute or home-relative; got ${filePath || "(empty)"}.`,
		);
	}
	if (!filePath.endsWith(".md")) {
		return unsafe(`Saved Plan must use a .md filename; got ${basename(filePath) || "(empty)"}.`);
	}
	const parsedName = parseSavedPlanFileName(basename(filePath));
	if (parsedName === undefined) return unsafe("Saved Plan has an invalid .md filename.");
	if (!isPathInside(directory.directoryPath, filePath)) {
		return unsafe(
			[
				"Saved Plan is lexically outside the current source branch's local plan store directory.",
				`Plan store directory: ${directory.directoryPath}`,
				`Saved Plan path: ${filePath}`,
			].join("\n"),
		);
	}

	const gateway = options.planStoreGateway ?? createRealPlanStoreGateway();
	try {
		const fileStat = await gateway.statPath(filePath);
		if (fileStat === undefined) {
			return { type: "not-found", message: `Saved Plan does not exist: ${filePath}` };
		}
		if (fileStat.type !== "file")
			return unsafe(`Saved Plan path is not a regular file: ${filePath}`);

		const realDirectoryPath = await gateway.realpathOrResolve(directory.directoryPath);
		const realFilePath = await gateway.realpathOrResolve(filePath);
		if (!isPathInside(realDirectoryPath, realFilePath)) {
			return unsafe(
				[
					"Saved Plan resolves outside the current source branch's local plan store directory.",
					`Resolved plan store directory: ${realDirectoryPath}`,
					`Resolved Saved Plan path: ${realFilePath}`,
				].join("\n"),
			);
		}

		const plan: ResolvedExplicitSavedPlanFile = {
			directory,
			filePath,
			content: await gateway.readTextFile(filePath),
			...parsedName,
		};
		return { type: "resolved", plan };
	} catch (error) {
		return { type: "error", message: formatErrorMessage(error) };
	}
}

export async function resolveSelectedSavedPlanFile(
	commands: CommandExecApi,
	options: ResolveSelectedSavedPlanFileOptions,
): Promise<SelectedSavedPlanFile> {
	if (options.explicitPath !== undefined) {
		const result = await resolveExplicitSavedPlanFile(commands, {
			...options,
			explicitPath: options.explicitPath,
		});
		if (result.type === "resolved") return { type: "explicit", plan: result.plan };
		throw new Error(result.message);
	}
	return { type: "latest", plan: await findLatestSavedPlanFile(commands, options) };
}

function unsafe(message: string): ExplicitSavedPlanFileResolution {
	return { type: "unsafe", message };
}
