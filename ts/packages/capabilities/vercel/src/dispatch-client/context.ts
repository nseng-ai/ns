// Entrypoint wiring for the dispatch ns commands (inversion rule in
// `docs/conventions/consumer-gateways-and-command-shape.md`): the command
// context binds every real gateway to the caller's command and interaction
// channels. Scenario tests inject a complete context through the command factory.
import { RealGitBrmemGateway } from "@nseng-ai/brmem";
import {
	createNsCommandRunner,
	NsCommandExecApi,
	NsStdinCapableCommandExecApi,
} from "@nseng-ai/capability-kit/command-runner";
import {
	loadModelPolicy,
	MODEL_OPERATION_IDS,
	resolveModelOperation,
} from "@nseng-ai/capability-kit/model-policy";
import { createNsClinkrInteraction } from "@nseng-ai/capability-kit/ns-context";
import { createFlowMinimalSubmitClient } from "@nseng-ai/flow/api";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { systemClock } from "@nseng-ai/foundation/time";
import type { NsCommandIo, NsExtensionApi } from "@nseng-ai/sdk";
import { nodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

import { RealDispatchSavedPlanGateway } from "./dispatch-plan/adapters.ts";
import { RealDispatchPlanSnapshotGateway } from "./dispatch-plan/real-snapshot-gateway.ts";
import type { DispatchPlanGateways, DispatchPromptGateways } from "./contracts.ts";
import { createRealDispatchContentSlugGateway } from "./content-slug.ts";
import { createRealDispatchAnchorPrGateway } from "./real-anchor-pr-gateway.ts";
import { createRealDispatchConfigGateway } from "./real-config-gateway.ts";
import { createRealDispatchLocalTokenGateway } from "./real-local-token-gateway.ts";
import {
	createRealDispatchGraphitePublicationAuthorizationGateway,
	createRealDispatchSourcePublicationGateway,
} from "./real-source-publication-gateways.ts";
import { createRealDispatchTriggerGateway } from "./real-trigger-gateway.ts";
import { createRealDispatchWorkspaceGitGateway } from "./real-workspace-git-gateway.ts";

import { generateRealDispatchId } from "./real-dispatch-id.ts";

export interface DispatchPromptCliContext {
	readonly cwd: string;
	readonly gateways: DispatchPromptGateways;
	readonly commandIo: NsCommandIo;
}

export interface DispatchPlanCliContext {
	readonly cwd: string;
	readonly gateways: DispatchPlanGateways;
	readonly commandIo: NsCommandIo;
}

/** Gateway substitutions published through `ctx.extensions.dispatch`. */
export type DispatchCommandOverrides = Partial<DispatchPlanGateways & DispatchPromptGateways>;

export async function createDispatchPromptContext(
	ctx: NsExtensionApi,
): Promise<DispatchPromptCliContext> {
	const overrides = readDispatchCommandOverrides(ctx);
	const execApi = new NsCommandExecApi(ctx);
	const localGitFacts = new RealGitGateway(execApi);
	const semanticSlugs =
		overrides?.semanticSlugs ??
		createRealDispatchContentSlugGateway(
			execApi,
			await resolveDispatchSlugModelSelection(ctx, localGitFacts),
		);
	return {
		cwd: ctx.cwd,
		commandIo: ctx.commandIo,
		gateways: {
			...createSharedDispatchGateways(ctx, overrides),
			semanticSlugs,
			clock: overrides?.clock ?? systemClock,
		},
	};
}

export async function createDispatchPlanContext(
	ctx: NsExtensionApi,
): Promise<DispatchPlanCliContext> {
	const overrides = readDispatchCommandOverrides(ctx);
	const commands = new NsStdinCapableCommandExecApi(ctx);
	const git = new RealGitGateway(commands);
	return {
		cwd: ctx.cwd,
		commandIo: ctx.commandIo,
		gateways: {
			...createSharedDispatchGateways(ctx, overrides),
			savedPlans:
				overrides?.savedPlans ??
				new RealDispatchSavedPlanGateway({ commands: new NsCommandExecApi(ctx) }),
			brmem: overrides?.brmem ?? new RealGitBrmemGateway({ cwd: ctx.cwd, commands, git }),
			snapshots:
				overrides?.snapshots ?? new RealDispatchPlanSnapshotGateway(new NsCommandExecApi(ctx)),
			generateDispatchId: overrides?.generateDispatchId ?? generateRealDispatchId,
		},
	};
}

function createSharedDispatchGateways(
	ctx: NsExtensionApi,
	overrides: DispatchCommandOverrides | undefined,
) {
	const runner = createNsCommandRunner(ctx);
	const execApi = new NsCommandExecApi(ctx);
	const localGitFacts = new RealGitGateway(execApi);
	return {
		git: overrides?.git ?? createRealDispatchWorkspaceGitGateway(localGitFacts, runner),
		sourcePublication:
			overrides?.sourcePublication ??
			createRealDispatchSourcePublicationGateway(
				createFlowMinimalSubmitClient({ cwd: ctx.cwd, commands: execApi, env: ctx.env }),
			),
		publicationAuthorization:
			overrides?.publicationAuthorization ??
			createRealDispatchGraphitePublicationAuthorizationGateway(
				createNsClinkrInteraction(ctx, { title: "Graphite source publication" }),
			),
		anchorPrs: overrides?.anchorPrs ?? createRealDispatchAnchorPrGateway(runner),
		trigger: overrides?.trigger ?? createRealDispatchTriggerGateway(),
		tokens: overrides?.tokens ?? createRealDispatchLocalTokenGateway({ env: ctx.env }),
		config: overrides?.config ?? createRealDispatchConfigGateway(),
	};
}

async function resolveDispatchSlugModelSelection(
	ctx: NsExtensionApi,
	git: Pick<RealGitGateway, "optionalRepoRoot">,
): Promise<ModelSelection> {
	const repository = await git.optionalRepoRoot({ cwd: ctx.cwd });
	if (repository.type !== "found") {
		throw new Error("Could not determine the repository root for ns.toml.");
	}
	const policy = loadModelPolicy({ repoRoot: repository.value, gateway: nodeProjectConfigGateway });
	if (!policy.ok) throw new Error(`Invalid model policy in ns.toml: ${policy.error.message}`);
	const model = resolveModelOperation(policy.value, MODEL_OPERATION_IDS.slug);
	if (!model.ok) throw new Error(`Invalid model policy in ns.toml: ${model.error.message}`);
	return model.value.selection;
}

function readDispatchCommandOverrides(ctx: NsExtensionApi): DispatchCommandOverrides | undefined {
	const raw = ctx.extensions?.dispatch;
	if (raw === undefined || raw === null || typeof raw !== "object") return undefined;
	const overrides = raw as DispatchCommandOverrides;
	return optionalEntries({
		git: overrides.git,
		sourcePublication: overrides.sourcePublication,
		publicationAuthorization: overrides.publicationAuthorization,
		anchorPrs: overrides.anchorPrs,
		trigger: overrides.trigger,
		tokens: overrides.tokens,
		config: overrides.config,
		semanticSlugs: overrides.semanticSlugs,
		clock: overrides.clock,
		savedPlans: overrides.savedPlans,
		brmem: overrides.brmem,
		snapshots: overrides.snapshots,
		generateDispatchId: overrides.generateDispatchId,
	});
}
