import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	matchProvisionFirstPartySkillFailure,
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

export interface RealSkillMaterializerOptions {
	context?: SkillMaterializationContext;
}

export class RealSkillMaterializer implements SkillMaterializer {
	private readonly context: SkillMaterializationContext;

	constructor(options: RealSkillMaterializerOptions = {}) {
		this.context = {
			env: { ...(options.context?.env ?? {}) },
			...optionalEntry("userHomeDir", options.context?.userHomeDir),
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
	return matchProvisionFirstPartySkillFailure<SkillMaterializeResult>(outcomeFailure, {
		catalogSourceUnavailable: (failureInfo) => ({
			type: "unavailable",
			reason: failureInfo.message,
		}),
		unknownSkill: () => ({
			type: "error",
			error: {
				code: "objective-skill-catalog-missing",
				message: "The first-party objective skill is missing from the harness artifact catalog.",
			},
		}),
		provisionError: (failureInfo) => ({
			type: "error",
			error: nsInitErrorFromProvisionError(harness, failureInfo.error),
		}),
		conflicted: (failureInfo) => ({
			type: "error",
			error: {
				code: "locally-edited-conflict",
				message: `Failed to materialize objective skills for ${harness}: ${failureInfo.message}.`,
				details: {
					harness,
					manifestPath: failureInfo.manifestPath,
					conflictingFiles: [...failureInfo.conflictingFiles],
				},
			},
		}),
	});
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
