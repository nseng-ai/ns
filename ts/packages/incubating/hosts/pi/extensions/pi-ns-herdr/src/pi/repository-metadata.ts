import { repositoryNameFromGitCommonDir } from "@nseng-ai/extension-kit/worktree-description";
import type {
	HerdrMetadataReportResult,
	HerdrMetadataToken,
	HerdrWorkspaceIdentityCandidate,
	HerdrWorkspaceIdentityCandidatesResult,
} from "@nseng-ai/herdr/api";

import type { HerdrPiContext } from "./context.ts";

const REPOSITORY_TOKEN_SOURCE = "ns:pi-repo";
const REPOSITORY_TOKEN_NAME = "repo";

interface RepositoryMetadataContext {
	readonly commands: Pick<HerdrPiContext["commands"], "on">;
	readonly git: Pick<HerdrPiContext["git"], "gitCommonDir" | "optionalRepoRoot">;
	readonly herdr: HerdrPiContext["herdr"];
}

interface RepositoryTokenPatch {
	readonly value: string | null;
}
type RepositoryPatchResult =
	| { type: "patch"; patch: RepositoryTokenPatch }
	| { type: "failed"; message: string };
type WorkspacePatchResult =
	| { type: "patch"; patch: RepositoryTokenPatch }
	| { type: "skip" }
	| { type: "failed"; message: string };

export function repositoryTokenPatch(gitCommonDir: string | null): RepositoryTokenPatch {
	if (gitCommonDir === null) return { value: null };
	return { value: repositoryNameFromGitCommonDir(gitCommonDir) ?? null };
}

export function registerHerdrRepositoryMetadata(context: RepositoryMetadataContext): void {
	context.commands.on("session_start", async (_event, ctx) => {
		try {
			await reportRepositoryMetadata(context, ctx.cwd, (message) =>
				ctx.ui.notify(message, "warning"),
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`Herdr repository metadata refresh failed: ${message}`, "warning");
		}
	});
}

async function reportRepositoryMetadata(
	context: RepositoryMetadataContext,
	cwd: string,
	notify: (message: string) => void,
): Promise<void> {
	const caller = await context.herdr.resolveCallerPane();
	if (caller.type === "failed") return;

	const [panePatch, workspaceCandidates] = await Promise.all([
		resolveRepositoryPatch(context, cwd),
		context.herdr.resolveWorkspaceIdentityCandidates(caller.workspaceId),
	]);

	await reportPaneRepository(context, caller.paneId, panePatch, notify);
	const workspacePatch = await resolveWorkspacePatch(context, workspaceCandidates);
	if (workspacePatch.type === "failed") {
		notify(workspacePatch.message);
		return;
	}
	if (workspacePatch.type === "skip" || workspaceCandidates.type !== "resolved") return;

	const refreshed = await context.herdr.resolveWorkspaceIdentityCandidates(caller.workspaceId);
	if (
		refreshed.type !== "resolved" ||
		!sameCandidates(workspaceCandidates.candidates, refreshed.candidates)
	) {
		return;
	}
	const refreshedPatch = await resolveWorkspacePatch(context, refreshed);
	if (refreshedPatch.type === "failed") {
		notify(refreshedPatch.message);
		return;
	}
	if (refreshedPatch.type === "skip" || refreshedPatch.patch.value !== workspacePatch.patch.value) {
		return;
	}
	const reported = await context.herdr.reportWorkspaceToken(
		caller.workspaceId,
		metadataToken(refreshedPatch.patch),
	);
	notifyReportFailure(reported, "workspace", notify);
}

async function reportPaneRepository(
	context: RepositoryMetadataContext,
	paneId: string,
	resolved: RepositoryPatchResult,
	notify: (message: string) => void,
): Promise<void> {
	if (resolved.type === "failed") {
		notify(`Could not resolve repository metadata for the Herdr pane: ${resolved.message}`);
		return;
	}
	const reported = await context.herdr.reportPaneToken(paneId, metadataToken(resolved.patch));
	notifyReportFailure(reported, "pane", notify);
}

async function resolveRepositoryPatch(
	context: RepositoryMetadataContext,
	cwd: string,
): Promise<RepositoryPatchResult> {
	const root = await context.git.optionalRepoRoot({ cwd });
	if (root.type === "error") return { type: "failed", message: root.error.message };
	if (root.type === "missing") return { type: "patch", patch: repositoryTokenPatch(null) };

	const commonDir = await context.git.gitCommonDir({ cwd });
	if (!commonDir.ok) return { type: "failed", message: commonDir.error.message };
	return { type: "patch", patch: repositoryTokenPatch(commonDir.value) };
}

async function resolveWorkspacePatch(
	context: RepositoryMetadataContext,
	resolved: HerdrWorkspaceIdentityCandidatesResult,
): Promise<WorkspacePatchResult> {
	if (resolved.type === "ambiguous") return { type: "skip" };
	if (resolved.type === "failed") {
		return {
			type: "failed",
			message: `Could not resolve Herdr workspace repository identity: ${resolved.message}`,
		};
	}
	const resolvedPatches = await Promise.all(
		resolved.candidates.map((candidate) => resolveRepositoryPatch(context, candidate.cwd)),
	);
	const failure = resolvedPatches.find((result) => result.type === "failed");
	if (failure?.type === "failed") {
		return {
			type: "failed",
			message: `Could not resolve Herdr workspace repository identity: ${failure.message}`,
		};
	}
	const patches = resolvedPatches.flatMap((result) =>
		result.type === "patch" ? [result.patch] : [],
	);
	const first = patches[0];
	if (first === undefined || patches.some((patch) => patch.value !== first.value)) {
		return { type: "skip" };
	}
	return { type: "patch", patch: first };
}

function metadataToken(patch: RepositoryTokenPatch): HerdrMetadataToken {
	return { source: REPOSITORY_TOKEN_SOURCE, name: REPOSITORY_TOKEN_NAME, value: patch.value };
}

function sameCandidates(
	left: readonly HerdrWorkspaceIdentityCandidate[],
	right: readonly HerdrWorkspaceIdentityCandidate[],
): boolean {
	return (
		left.length === right.length &&
		left.every(
			(candidate, index) =>
				candidate.paneId === right[index]?.paneId && candidate.cwd === right[index]?.cwd,
		)
	);
}

function notifyReportFailure(
	result: HerdrMetadataReportResult,
	resource: "pane" | "workspace",
	notify: (message: string) => void,
): void {
	if (result.type === "failed") {
		notify(`Could not report Herdr ${resource} repository metadata: ${result.message}`);
	}
}
