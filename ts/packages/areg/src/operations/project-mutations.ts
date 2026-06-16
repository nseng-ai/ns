import type { AregCliContext } from "../context.ts";
import type { AregErrorInfo, AregProjectMutationPolicy } from "../gateways.ts";

interface ProjectTextWritePlan {
	relativePath: string;
	content: string;
	description: string;
	createParent: boolean;
}

interface ProjectDeletePlan {
	relativePath: string;
	description: string;
}

interface ProjectRemoveEmptyDirPlan {
	relativePath: string;
	description: string;
}

interface BaseApplyProjectMutationPlanRequest {
	ctx: AregCliContext;
	projectDir: string;
	writes: readonly ProjectTextWritePlan[];
}

type ApplyProjectMutationPlanRequest =
	| (BaseApplyProjectMutationPlanRequest & { policy: Exclude<AregProjectMutationPolicy, "skill-kind"> })
	| (BaseApplyProjectMutationPlanRequest & {
		policy: "skill-kind";
		deletes: readonly ProjectDeletePlan[];
		removeEmptyDirs: readonly ProjectRemoveEmptyDirPlan[];
	});

export type ApplyProjectMutationPlanResult =
	| {
		ok: true;
		writtenRelativePaths: readonly string[];
		deletedRelativePaths: readonly string[];
		removedEmptyDirRelativePaths: readonly string[];
	}
	| { ok: false; error: AregErrorInfo };

export async function applyProjectMutationPlan(request: ApplyProjectMutationPlanRequest): Promise<ApplyProjectMutationPlanResult> {
	const writtenRelativePaths: string[] = [];
	for (const write of request.writes) {
		const result = await request.ctx.project.writeTextFile({
			projectDir: request.projectDir,
			relativePath: write.relativePath,
			content: write.content,
			description: write.description,
			createParent: write.createParent,
			policy: request.policy,
			env: request.ctx.env,
		});
		if (!result.ok) return result;
		writtenRelativePaths.push(write.relativePath);
	}

	const deletedRelativePaths: string[] = [];
	const removedEmptyDirRelativePaths: string[] = [];
	if (request.policy === "skill-kind") {
		for (const deletePlan of request.deletes) {
			const result = await request.ctx.project.deleteFile({
				projectDir: request.projectDir,
				relativePath: deletePlan.relativePath,
				description: deletePlan.description,
				policy: "skill-kind",
				env: request.ctx.env,
			});
			if (!result.ok) return result;
			deletedRelativePaths.push(deletePlan.relativePath);
		}
		for (const removePlan of request.removeEmptyDirs) {
			const result = await request.ctx.project.removeEmptyDir({
				projectDir: request.projectDir,
				relativePath: removePlan.relativePath,
				description: removePlan.description,
				policy: "skill-kind",
				env: request.ctx.env,
			});
			if (!result.ok) return result;
			if (result.removed) removedEmptyDirRelativePaths.push(removePlan.relativePath);
		}
	}

	return { ok: true, writtenRelativePaths, deletedRelativePaths, removedEmptyDirRelativePaths };
}
