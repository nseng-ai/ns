import { sanitizeBranchName } from "@nseng-ai/foundation/branch-slug";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import { createNsGitGateway } from "@nseng-ai/extension-kit";
import {
	prepareCheckpointMessage,
	createCommitWithPreparedMessage,
} from "@nseng-ai/extension-kit/checkpoint-flow";
import { NsCommandExecApi } from "@nseng-ai/extension-kit/command-runner";
import { deriveSlugWithModel, formatRawTextModelFailure } from "@nseng-ai/extension-kit/model-slug";
import {
	loadModelPolicy,
	MODEL_OPERATION_IDS,
	resolveModelOperation,
} from "@nseng-ai/extension-kit/model-policy";
import { createNodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import type {
	GsAutobranchContext,
	GsAutobranchGitFacts,
	GsAutobranchPreparationGateway,
} from "../core/autobranch.ts";
import {
	RealGsAutobranchCheckpointGateway,
	RealGsAutobranchGitGateway,
	RealGsAutobranchProviderGateway,
} from "../core/real-autobranch-gateways.ts";

export async function createRealGsAutobranchContext(
	ctx: NsExtensionApi,
): Promise<{ ok: true; context: GsAutobranchContext } | { ok: false; message: string }> {
	const git = createNsGitGateway(ctx);
	const repository = await git.optionalRepoRoot({ cwd: ctx.cwd });
	if (repository.type !== "found")
		return { ok: false, message: "Could not determine the repository root for ns.toml." };
	const policy = loadModelPolicy({
		repoRoot: repository.value,
		gateway: createNodeProjectConfigGateway(),
	});
	if (!policy.ok)
		return { ok: false, message: `Invalid model policy in ns.toml: ${policy.error.message}` };
	const slugModel = resolveModelOperation(policy.value, MODEL_OPERATION_IDS.slug);
	const checkpointModel = resolveModelOperation(policy.value, MODEL_OPERATION_IDS.gsCheckpoint);
	if (!slugModel.ok) return { ok: false, message: slugModel.error.message };
	if (!checkpointModel.ok) return { ok: false, message: checkpointModel.error.message };
	const commands = new NsCommandExecApi(ctx);
	const checkpoint = new RealGsAutobranchCheckpointGateway((message) =>
		createCommitWithPreparedMessage({
			cwd: ctx.cwd,
			message,
			exec: (command, args, cwd, timeout) => commands.exec(command, args, { cwd, timeout }),
		}),
	);
	return {
		ok: true,
		context: {
			git: new RealGsAutobranchGitGateway(commands, ctx.cwd),
			provider: new RealGsAutobranchProviderGateway(commands, ctx.cwd),
			checkpoint,
			preparation: new RealGsAutobranchPreparationGateway(
				ctx,
				commands,
				slugModel.value.selection,
				checkpointModel.value.selection,
			),
		},
	};
}

class RealGsAutobranchPreparationGateway implements GsAutobranchPreparationGateway {
	private readonly ctx: NsExtensionApi;
	private readonly commands: NsCommandExecApi;
	private readonly slugModel: ModelSelection;
	private readonly checkpointModel: ModelSelection;
	constructor(
		ctx: NsExtensionApi,
		commands: NsCommandExecApi,
		slugModel: ModelSelection,
		checkpointModel: ModelSelection,
	) {
		this.ctx = ctx;
		this.commands = commands;
		this.slugModel = slugModel;
		this.checkpointModel = checkpointModel;
	}
	async prepare(input: { readonly requestedSlug?: string; readonly facts: GsAutobranchGitFacts }) {
		let child: string | undefined;
		if (input.requestedSlug !== undefined) child = sanitizeBranchName(input.requestedSlug);
		else {
			const prompt = buildSlugPrompt(input.facts);
			const model = await deriveSlugWithModel({
				cwd: input.facts.root,
				prompt,
				modelSelection: this.slugModel,
				slugKind: "GS child branch slug",
				normalizeOutput: sanitizeBranchName,
				exec: (command, args, options) => this.commands.exec(command, args, options),
			});
			child = model.ok ? model.evidence.slug : fallbackSlug(input.facts);
			if (child === undefined)
				return {
					ok: false as const,
					message:
						`Could not derive a branch slug. ${model.ok ? "" : formatRawTextModelFailure(model.failure)}`.trim(),
				};
		}
		if (child === undefined)
			return { ok: false as const, message: "The requested slug cannot form a valid branch name." };
		const checkpoint = await prepareCheckpointMessage({
			status: input.facts.status,
			diff: input.facts.diff,
			textGenerator: this.ctx.textGenerator,
			modelSelection: this.checkpointModel,
		});
		if (!checkpoint.ok) return { ok: false as const, message: checkpoint.error };
		return { ok: true as const, value: { child, checkpointMessage: checkpoint.message } };
	}
}

function buildSlugPrompt(facts: GsAutobranchGitFacts): string {
	return `Generate one conservative kebab-case git branch slug (lowercase ASCII, no explanation, at most 64 characters) for this pending GS change.\n\n## status\n${facts.status.slice(0, 8_000)}\n\n## diff\n${facts.diff.slice(0, 24_000)}`;
}
function fallbackSlug(facts: GsAutobranchGitFacts): string | undefined {
	const paths = facts.status
		.split("\0")
		.filter(Boolean)
		.slice(0, 4)
		.map(
			(line) =>
				line
					.slice(3)
					.replace(/^.* -> /u, "")
					.split("/")
					.at(-1) ?? "",
		);
	return sanitizeBranchName(`update ${paths.join(" ") || facts.branch || "work"}`);
}
