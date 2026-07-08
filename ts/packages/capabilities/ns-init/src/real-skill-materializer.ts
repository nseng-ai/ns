import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	provisionFirstPartySkill,
	splitProvisionFirstPartySkillOutcome,
	type HarnessArtifactProvisionErrorInfo,
	type HarnessId,
	type ProvisionFirstPartySkillFailure,
} from "@nseng-ai/harness-artifacts/api";

import type { NsInitErrorInfo } from "./error-info.ts";
import type {
	SkillMaterializeParams,
	SkillMaterializer,
	SkillMaterializeResult,
} from "./skill-materializer.ts";

export interface SkillMaterializationContext {
	/** User home already adapted by the ns-init command/API layer, when materialization needs user scope. */
	userHomeDir?: string;
	env: Record<string, string | undefined>;
}

export class RealSkillMaterializer implements SkillMaterializer {
	private readonly context: SkillMaterializationContext;

	constructor(context: SkillMaterializationContext) {
		this.context = {
			env: { ...context.env },
			...optionalEntry("userHomeDir", context.userHomeDir),
		};
	}

	async materializeObjectiveSkills(
		params: SkillMaterializeParams,
	): Promise<SkillMaterializeResult> {
		const installedSkillPaths: string[] = [];
		for (const harness of params.harnesses) {
			const outcome = await provisionFirstPartySkill({
				skill: "objective",
				harness,
				scope: "project",
				projectRoot: params.repoRoot,
				...optionalEntry("homeDir", this.context.userHomeDir),
				env: this.context.env,
				isDryRun: false,
				shouldForce: false,
			});
			const split = splitProvisionFirstPartySkillOutcome(outcome);
			if (split.type === "failure") return materializeFailureResult(harness, split.failure);
			installedSkillPaths.push(split.outcome.plan.targetArtifactPath);
		}
		return { type: "materialized", installedSkillPaths };
	}
}

function materializeFailureResult(
	harness: HarnessId,
	outcomeFailure: ProvisionFirstPartySkillFailure,
): SkillMaterializeResult {
	switch (outcomeFailure.code) {
		case "catalog-source-unavailable":
			return {
				type: "unavailable",
				reason: outcomeFailure.message,
			};
		case "unknown-skill":
			return {
				type: "error",
				error: {
					code: "objective-skill-catalog-missing",
					message: "The first-party objective skill is missing from the harness artifact catalog.",
				},
			};
		case "provision-error":
			return {
				type: "error",
				error: nsInitErrorFromProvisionError(harness, outcomeFailure.error),
			};
		case "conflicted":
			return {
				type: "error",
				error: {
					code: "locally-edited-conflict",
					message: `Failed to materialize objective skills for ${harness}: ${outcomeFailure.message}.`,
					details: {
						harness,
						manifestPath: outcomeFailure.manifestPath,
						conflictingFiles: [...outcomeFailure.conflictingFiles],
					},
				},
			};
	}
}

function nsInitErrorFromProvisionError(
	harness: HarnessId,
	error: HarnessArtifactProvisionErrorInfo,
): NsInitErrorInfo {
	return {
		code: error.code,
		message: `Failed to materialize objective skills for ${harness}: ${error.message}`,
		details: { harness, ...error.details },
	};
}
