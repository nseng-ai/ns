import type { AregCliContext } from "../context.ts";
import type { PathState } from "../gateways.ts";

export interface ProjectPathInspection {
	projectDir: string;
	projectPathState: PathState;
}

export type ResolvedProjectGitRoot<TInspection extends ProjectPathInspection> =
	| {
			type: "ok";
			targetInspection: TInspection;
			projectDir: string;
	  }
	| { type: "error"; message: string; projectDir: string };

export async function inspectResolvedProjectGitRoot<TInspection extends ProjectPathInspection>(
	ctx: AregCliContext,
	requestPath: string,
	inspectProjectPath: (ctx: AregCliContext, requestPath: string) => Promise<TInspection>,
): Promise<ResolvedProjectGitRoot<TInspection>> {
	const targetInspection = await inspectProjectPath(ctx, requestPath);
	if (targetInspection.projectPathState.type === "missing") {
		return {
			type: "error",
			message: `Target ${targetInspection.projectDir} does not exist.`,
			projectDir: targetInspection.projectDir,
		};
	}
	if (targetInspection.projectPathState.type !== "directory") {
		return {
			type: "error",
			message: `${targetInspection.projectDir} is not a directory.`,
			projectDir: targetInspection.projectDir,
		};
	}
	const repoRoot = await ctx.git.optionalRepoRoot({ cwd: targetInspection.projectDir });
	if (repoRoot.type === "error") {
		return {
			type: "error",
			message: repoRoot.error.message,
			projectDir: targetInspection.projectDir,
		};
	}
	if (repoRoot.type === "missing") {
		return {
			type: "error",
			message: `No Git root found containing ${targetInspection.projectDir}.`,
			projectDir: targetInspection.projectDir,
		};
	}
	return { type: "ok", targetInspection, projectDir: repoRoot.value };
}
