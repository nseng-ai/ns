import {
	resolveExplicitSavedPlanFile,
	type ExplicitSavedPlanFileResolution,
	type ResolveExplicitSavedPlanFileOptions,
} from "@nseng-ai/plans/api";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";

import type { DispatchSavedPlanGateway, DispatchSavedPlanResolution } from "./preparation.ts";

type ResolveExplicitSavedPlan = (
	commands: CommandExecApi,
	options: ResolveExplicitSavedPlanFileOptions,
) => Promise<ExplicitSavedPlanFileResolution>;

export interface RealDispatchSavedPlanGatewayOptions {
	readonly commands: CommandExecApi;
	readonly resolveExplicitSavedPlan?: ResolveExplicitSavedPlan;
}

export class RealDispatchSavedPlanGateway implements DispatchSavedPlanGateway {
	private readonly commands: CommandExecApi;
	private readonly resolveSavedPlanFile: ResolveExplicitSavedPlan;

	constructor(options: RealDispatchSavedPlanGatewayOptions) {
		this.commands = options.commands;
		this.resolveSavedPlanFile = options.resolveExplicitSavedPlan ?? resolveExplicitSavedPlanFile;
	}

	async resolveExplicitSavedPlan(options: {
		readonly cwd: string;
		readonly planRef: string;
	}): Promise<DispatchSavedPlanResolution> {
		const resolution = await this.resolveSavedPlanFile(this.commands, {
			cwd: options.cwd,
			explicitPath: options.planRef,
		});
		if (resolution.type !== "resolved") return resolution;

		return {
			type: "resolved",
			plan: {
				filePath: resolution.plan.filePath,
				slug: resolution.plan.slug,
				sourceBranch: resolution.plan.sourceBranch,
				content: resolution.plan.content,
			},
		};
	}
}
