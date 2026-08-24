import { failure, negative, ok, usageError, z } from "@nseng-ai/sdk";

import type { GsRestackGitGateway, GsRestackGitState } from "./git.ts";
import { GS_RESTACK_VERSION, type GsRestackDiagnostic, type GsRestackGateway } from "./gateway.ts";

const UNMERGED_PATH_LIMIT = 20;
const diagnosticSchema = z.strictObject({
	command: z.string(),
	termination: z.string(),
	stdout: z.string().max(1_100),
	stderr: z.string().max(1_100),
});
const recoverySchema = z.strictObject({
	action: z.enum([
		"none",
		"install-supported-gh-stack",
		"clean-worktree",
		"checkout-named-branch",
		"finish-active-operation",
		"resolve-conflicts",
		"stage-resolution",
		"authorize-rewrite",
		"inspect-gh-stack-error",
	]),
	instruction: z.string().max(300),
});

export const gsRestackRequestSchema = z.lazy(() =>
	z.strictObject({
		downstack: z.boolean().default(false),
		yes: z.boolean().default(false),
	}),
);
export type GsRestackRequest = z.infer<typeof gsRestackRequestSchema>;

export const gsRestackResultSchema = z.lazy(() =>
	z.strictObject({
		outcome: z.enum(["completed", "conflict-stopped", "refused"]),
		mode: z.enum(["start", "continue"]),
		requestedScope: z.enum(["full", "downstack"]),
		observedVersion: z.string().nullable(),
		currentOperation: z.enum(["none", "rebase", "merge", "cherry-pick", "revert", "bisect"]),
		branch: z.discriminatedUnion("state", [
			z.strictObject({ state: z.literal("named"), name: z.string().min(1) }),
			z.strictObject({ state: z.literal("detached") }),
		]),
		unmergedPaths: z.array(z.string()).max(UNMERGED_PATH_LIMIT),
		hasStagedChanges: z.boolean(),
		recovery: recoverySchema,
		diagnostic: diagnosticSchema.nullable(),
	}),
);
export type GsRestackResult = z.infer<typeof gsRestackResultSchema>;

export interface GsRestackContext {
	readonly restack: GsRestackGateway;
	readonly git: GsRestackGitGateway;
}

export interface GsRestackInteraction {
	isInteractive(): boolean;
	confirm(message: string): Promise<boolean>;
}

export async function runGsRestackResolve(
	context: GsRestackContext,
	interaction: GsRestackInteraction,
	request: GsRestackRequest,
) {
	const version = await context.restack.readVersion();
	if (!version.ok) {
		return failure(
			"restack-inspection-failed",
			"Could not inspect the gh-stack version.",
			resultData(request, null, null, version.diagnostic),
		);
	}
	const inspected = await context.git.inspect();
	if (!inspected.ok) {
		return failure(
			"restack-inspection-failed",
			"Could not inspect Git state.",
			resultData(request, null, version.value, null),
		);
	}
	const before = inspected.state;
	const mode = before.operation === "rebase" ? "continue" : "start";
	let data = resultData(request, before, version.value, null);

	if (version.value !== GS_RESTACK_VERSION) {
		return negative(`gh-stack ${GS_RESTACK_VERSION} is required.`, {
			data: recover(
				data,
				"install-supported-gh-stack",
				`Install gh-stack ${GS_RESTACK_VERSION}, then rerun this command.`,
			),
		});
	}
	if (before.operation !== "none" && before.operation !== "rebase") {
		return negative(`Git ${before.operation} is active.`, {
			data: recover(
				data,
				"finish-active-operation",
				"Finish or abort the active Git operation, then rerun this command.",
			),
		});
	}
	if (mode === "start") {
		if (before.branch === null) {
			return negative("A named branch is required to start a restack.", {
				data: recover(data, "checkout-named-branch", "Check out a named branch, then rerun."),
			});
		}
		if (!before.clean) {
			return negative("The worktree must be clean before starting a restack.", {
				data: recover(data, "clean-worktree", "Commit or stash worktree changes, then rerun."),
			});
		}
	} else {
		if (request.downstack) {
			return usageError("--downstack cannot change an active rebase scope.", data);
		}
		if (before.unmergedPaths.length > 0) {
			return negative("The rebase has unresolved paths.", {
				data: recover(
					{ ...data, outcome: "conflict-stopped" },
					"resolve-conflicts",
					"Resolve and stage the listed paths, then rerun this command.",
				),
			});
		}
		if (!before.hasStagedChanges) {
			return negative("The rebase continuation has no staged resolution.", {
				data: recover(
					data,
					"stage-resolution",
					"Stage the accepted resolution, then rerun this command.",
				),
			});
		}
	}

	const authorization = await authorize(interaction, request, data);
	if (authorization !== true) return authorization;
	const mutation =
		mode === "continue"
			? await context.restack.continue()
			: await context.restack.start(request.downstack ? "downstack" : "full");
	const after = await context.git.inspect();
	if (!after.ok) {
		return failure("restack-protocol-failed", "Could not inspect Git after `gh stack rebase`.", {
			...data,
			diagnostic: mutation.ok ? null : mutation.diagnostic,
		});
	}
	data = {
		...resultData(request, after.state, version.value, mutation.ok ? null : mutation.diagnostic),
		mode,
	};
	if (after.state.operation === "rebase" && after.state.unmergedPaths.length > 0) {
		return negative("`gh stack rebase` stopped at a conflict.", {
			data: recover(
				{ ...data, outcome: "conflict-stopped" },
				"resolve-conflicts",
				"Resolve and stage the listed paths, then rerun this command.",
			),
		});
	}
	if (!mutation.ok) {
		return negative("`gh stack rebase` refused the requested operation.", {
			data: recover(
				data,
				"inspect-gh-stack-error",
				"Inspect the gh-stack diagnostic, then rerun this command after correcting it.",
			),
		});
	}
	if (after.state.operation === "none" && after.state.clean) {
		return ok({
			...data,
			outcome: "completed",
			recovery: { action: "none", instruction: "Continue with the next workflow step." },
		} satisfies GsRestackResult);
	}
	return negative("`gh stack rebase` did not reach a classifiable completion or conflict stop.", {
		data: recover(
			data,
			"inspect-gh-stack-error",
			"Inspect the gh-stack diagnostic and Git state before rerunning this command.",
		),
	});
}

export function renderGsRestackHuman(data: GsRestackResult): string {
	const branch = data.branch.state === "named" ? data.branch.name : "detached HEAD";
	return [
		`${data.outcome}: ${data.mode} (${data.requestedScope})`,
		`Branch: ${branch}; operation: ${data.currentOperation}`,
		`Unmerged paths: ${data.unmergedPaths.length}; staged changes: ${data.hasStagedChanges ? "yes" : "no"}`,
		...(data.diagnostic === null ? [] : [`gh-stack: ${data.diagnostic.termination}`]),
		`Recovery: ${data.recovery.instruction}`,
	].join("\n");
}

async function authorize(
	interaction: GsRestackInteraction,
	request: GsRestackRequest,
	data: GsRestackResult,
) {
	if (request.yes) return true;
	if (!interaction.isInteractive()) {
		return usageError(
			"This local branch rewrite requires --yes.",
			recover(
				data,
				"authorize-rewrite",
				"Rerun with --yes to authorize one `gh stack rebase` invocation.",
			),
		);
	}
	if (await interaction.confirm(`Run the ${data.mode} \`gh stack rebase\` invocation?`))
		return true;
	return negative("Restack was not authorized.", {
		data: recover(
			data,
			"authorize-rewrite",
			"Rerun and authorize the `gh stack rebase` invocation.",
		),
	});
}

function resultData(
	request: GsRestackRequest,
	state: GsRestackGitState | null,
	observedVersion: string | null,
	diagnostic: GsRestackDiagnostic | null,
): GsRestackResult {
	const mode = state?.operation === "rebase" ? "continue" : "start";
	return {
		outcome: "refused",
		mode,
		requestedScope: request.downstack ? "downstack" : "full",
		observedVersion,
		currentOperation: state?.operation ?? "none",
		branch:
			state?.branch === null || state === null
				? { state: "detached" }
				: { state: "named", name: state.branch },
		unmergedPaths: [...(state?.unmergedPaths ?? [])].slice(0, UNMERGED_PATH_LIMIT),
		hasStagedChanges: state?.hasStagedChanges ?? false,
		recovery: {
			action: "inspect-gh-stack-error",
			instruction: "Inspect the reported state before rerunning this command.",
		},
		diagnostic,
	};
}

function recover(
	data: GsRestackResult,
	action: GsRestackResult["recovery"]["action"],
	instruction: string,
): GsRestackResult {
	return { ...data, recovery: { action, instruction } };
}
