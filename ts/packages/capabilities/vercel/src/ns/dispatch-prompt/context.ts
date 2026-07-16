// Entrypoint wiring for the dispatch ns commands (inversion rule in
// `docs/conventions/consumer-gateways-and-command-shape.md`): the command
// context binds real gateways to the command's exec channel and cwd here,
// and scenario tests substitute in-memory fakes through
// `ctx.extensions.dispatch` — the same override pattern the objectives
// runner commands use.
import { RealGitBrmemGateway } from "@nseng-ai/brmem";
import {
	createNsCommandRunner,
	NsCommandExecApi,
	NsStdinCapableCommandExecApi,
} from "@nseng-ai/capability-kit/command-runner";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import type { NsCommandIo, NsExtensionApi } from "@nseng-ai/sdk";

import { RealDispatchSavedPlanGateway } from "../dispatch-plan/adapters.ts";
import { RealDispatchPlanSnapshotGateway } from "../dispatch-plan/real-snapshot-gateway.ts";
import type { DispatchPlanGateways, DispatchPromptGateways } from "./contracts.ts";
import { createRealDispatchAnchorPrGateway } from "./real-anchor-pr-gateway.ts";
import { generateRealAnchorId } from "./real-anchor-id.ts";
import { createRealDispatchConfigGateway } from "./real-config-gateway.ts";
import { createRealDispatchLocalTokenGateway } from "./real-local-token-gateway.ts";
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
export type DispatchCommandOverrides = Partial<DispatchPlanGateways>;

export function createDispatchPromptContext(ctx: NsExtensionApi): DispatchPromptCliContext {
	const overrides = readDispatchCommandOverrides(ctx);
	const runner = createNsCommandRunner(ctx);
	const localGitFacts = new RealGitGateway(new NsCommandExecApi(ctx));
	return {
		cwd: ctx.cwd,
		commandIo: ctx.commandIo,
		gateways: {
			git: overrides?.git ?? createRealDispatchWorkspaceGitGateway(localGitFacts, runner),
			anchorPrs: overrides?.anchorPrs ?? createRealDispatchAnchorPrGateway(runner),
			trigger: overrides?.trigger ?? createRealDispatchTriggerGateway(),
			tokens: overrides?.tokens ?? createRealDispatchLocalTokenGateway({ env: ctx.env }),
			config: overrides?.config ?? createRealDispatchConfigGateway(),
			generateAnchorId: overrides?.generateAnchorId ?? generateRealAnchorId,
		},
	};
}

export function createDispatchPlanContext(ctx: NsExtensionApi): DispatchPlanCliContext {
	const overrides = readDispatchCommandOverrides(ctx);
	const commands = new NsStdinCapableCommandExecApi(ctx);
	const git = new RealGitGateway(commands);
	const shared = createDispatchPromptContext(ctx);
	return {
		...shared,
		gateways: {
			...shared.gateways,
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

function readDispatchCommandOverrides(ctx: NsExtensionApi): DispatchCommandOverrides | undefined {
	const raw = ctx.extensions?.dispatch;
	if (raw === undefined || raw === null || typeof raw !== "object") return undefined;
	const overrides = raw as DispatchCommandOverrides;
	return optionalEntries({
		git: overrides.git,
		anchorPrs: overrides.anchorPrs,
		trigger: overrides.trigger,
		tokens: overrides.tokens,
		config: overrides.config,
		generateAnchorId: overrides.generateAnchorId,
		savedPlans: overrides.savedPlans,
		brmem: overrides.brmem,
		snapshots: overrides.snapshots,
		generateDispatchId: overrides.generateDispatchId,
	});
}
