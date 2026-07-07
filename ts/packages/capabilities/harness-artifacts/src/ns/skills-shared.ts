import { failure, negative, usageError, type ClinkrExit } from "@nseng-ai/clinkr";

import {
	firstPartySkillProvisionPathContext,
	type HarnessArtifactProvisionErrorInfo,
	type HarnessPathErrorInfo,
} from "../api.ts";

export interface SkillsCommandContext {
	cwd: string;
	projectRoot: string;
	homeDir?: string;
	env: Record<string, string | undefined>;
}

export function harnessResolutionContext(context: SkillsCommandContext) {
	return firstPartySkillProvisionPathContext({
		projectRoot: context.projectRoot,
		homeDir: context.homeDir ?? context.env.HOME ?? "",
		env: context.env,
	});
}

export function unknownSkillExit<T>(skill: string): ClinkrExit<T> {
	return negative(`Unknown first-party ns skill ${JSON.stringify(skill)}.`);
}

export function provisionErrorExit<T>(error: HarnessArtifactProvisionErrorInfo): ClinkrExit<T> {
	if (error.code === "unknown_harness") return harnessPathErrorExit(error);
	return failure(error.code.replaceAll("_", "-"), error.message, error.details);
}

export function harnessPathErrorExit<T>(error: HarnessPathErrorInfo): ClinkrExit<T> {
	if (error.code === "unknown_harness") {
		return usageError(error.message, { field: "harness", ...error.details });
	}
	return failure(error.code.replaceAll("_", "-"), error.message, error.details);
}
