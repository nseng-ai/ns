import { failure, negative, usageError, type ClinkrExit } from "@nseng-ai/clinkr";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import {
	ALL_HARNESS_IDS,
	firstPartySkillProvisionPathContext,
	HARNESS_SCOPES,
	type HarnessArtifactProvisionErrorInfo,
	type HarnessPathErrorInfo,
} from "../api.ts";

export interface SkillsCommandContext {
	cwd: string;
	projectRoot: string;
	homeDir?: string;
	env: Record<string, string | undefined>;
}

export const skillsTargetRequestSchema = z.object({
	skill: z.string().min(1),
	harness: z.string().min(1),
	scope: z.enum(HARNESS_SCOPES).default("project"),
});

export const skillsResolvedArtifactLocationSchema = z.object({
	skill: z.string(),
	artifactId: z.string(),
	harness: z.enum(ALL_HARNESS_IDS),
	scope: z.enum(HARNESS_SCOPES),
	targetRoot: z.string(),
	targetArtifactPath: z.string(),
});

export function harnessResolutionContext(context: SkillsCommandContext) {
	return firstPartySkillProvisionPathContext({
		projectRoot: context.projectRoot,
		...optionalEntry("homeDir", context.homeDir),
		env: context.env,
	});
}

export function unknownSkillExit<T>(skill: string): ClinkrExit<T, unknown, unknown, unknown> {
	return negative(`Unknown first-party ns skill ${JSON.stringify(skill)}.`);
}

export function provisionErrorExit<T>(
	error: HarnessArtifactProvisionErrorInfo,
): ClinkrExit<T, unknown, unknown, unknown> {
	if (error.code === "unknown_harness") return harnessPathErrorExit(error);
	return genericFailureExit(error);
}

export function harnessPathErrorExit<T>(
	error: HarnessPathErrorInfo,
): ClinkrExit<T, unknown, unknown, unknown> {
	if (error.code === "unknown_harness") {
		return usageError(error.message, { field: "harness", ...error.details });
	}
	return genericFailureExit(error);
}

function genericFailureExit<T>(error: {
	code: string;
	message: string;
	details?: unknown;
}): ClinkrExit<T, unknown, unknown, unknown> {
	return failure(error.code.replaceAll("_", "-"), error.message, error.details);
}
