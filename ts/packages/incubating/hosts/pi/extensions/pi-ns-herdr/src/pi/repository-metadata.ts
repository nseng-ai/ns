import { repositoryNameFromGitCommonDir } from "@nseng-ai/extension-kit/worktree-description";
import type { HerdrMetadataGateway, HerdrMetadataToken } from "@nseng-ai/herdr/api";

import type { HerdrPiContext } from "./context.ts";

const REPOSITORY_TOKEN_SOURCE = "ns:pi-repo";
const REPOSITORY_TOKEN_NAME = "repo";

interface RepositoryMetadataContext {
	readonly commands: Pick<HerdrPiContext["commands"], "on">;
	readonly git: Pick<HerdrPiContext["git"], "gitCommonDir" | "optionalRepoRoot">;
	readonly herdr: Pick<HerdrPiContext["herdr"], "resolveCallerPane">;
	readonly metadata: HerdrMetadataGateway;
}

export function registerHerdrRepositoryMetadata(context: RepositoryMetadataContext): void {
	context.commands.on("session_start", async (_event, ctx) => {
		const caller = await context.herdr.resolveCallerPane();
		if (caller.type === "failed") return;

		const token = await resolveRepositoryToken(context, ctx.cwd);
		if (token.type === "failed") {
			ctx.ui.notify(`Could not resolve Herdr repository metadata: ${token.message}`, "warning");
			return;
		}

		const targets = [
			{ type: "pane" as const, id: caller.paneId },
			{ type: "workspace" as const, id: caller.workspaceId },
		];
		const results = await Promise.all(
			targets.map(async (target) => ({
				target,
				result: await context.metadata.reportToken(target, token.value),
			})),
		);
		for (const { target, result } of results) {
			if (result.type === "failed") {
				ctx.ui.notify(
					`Could not report Herdr ${target.type} repository metadata: ${result.message}`,
					"warning",
				);
			}
		}
	});
}

async function resolveRepositoryToken(
	context: RepositoryMetadataContext,
	cwd: string,
): Promise<{ type: "resolved"; value: HerdrMetadataToken } | { type: "failed"; message: string }> {
	const root = await context.git.optionalRepoRoot({ cwd });
	if (root.type === "error") return { type: "failed", message: root.error.message };
	if (root.type === "missing") return { type: "resolved", value: repositoryToken(null) };

	const commonDir = await context.git.gitCommonDir({ cwd });
	if (!commonDir.ok) return { type: "failed", message: commonDir.error.message };
	return { type: "resolved", value: repositoryToken(commonDir.value) };
}

function repositoryToken(gitCommonDir: string | null): HerdrMetadataToken {
	return {
		source: REPOSITORY_TOKEN_SOURCE,
		name: REPOSITORY_TOKEN_NAME,
		value: gitCommonDir === null ? null : (repositoryNameFromGitCommonDir(gitCommonDir) ?? null),
	};
}
