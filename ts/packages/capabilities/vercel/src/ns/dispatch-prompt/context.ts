// Entrypoint wiring for the dispatch ns commands (inversion rule in
// `docs/conventions/consumer-gateways-and-command-shape.md`): the command
// context binds real gateways to the command's exec channel and cwd here,
// and scenario tests substitute in-memory fakes through
// `ctx.extensions.dispatch` — the same override pattern the objectives
// runner commands use.
import { createNsCommandRunner } from "@nseng-ai/capability-kit/command-runner";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import type { DispatchPromptGateways } from "./contracts.ts";
import {
	createRealDispatchAnchorPrGateway,
	createRealDispatchConfigGateway,
	createRealDispatchLocalTokenGateway,
	createRealDispatchTriggerGateway,
	createRealDispatchWorkspaceGitGateway,
	generateRealAnchorId,
} from "./real-gateways.ts";

export interface DispatchPromptCliContext {
	readonly cwd: string;
	readonly gateways: DispatchPromptGateways;
}

/** Gateway substitutions published through `ctx.extensions.dispatch`. */
export type DispatchCommandOverrides = Partial<DispatchPromptGateways>;

export function createDispatchPromptContext(ctx: NsExtensionApi): DispatchPromptCliContext {
	const overrides = readDispatchCommandOverrides(ctx);
	const runner = createNsCommandRunner(ctx);
	return {
		cwd: ctx.cwd,
		gateways: {
			git: overrides?.git ?? createRealDispatchWorkspaceGitGateway(runner),
			anchorPrs: overrides?.anchorPrs ?? createRealDispatchAnchorPrGateway(runner),
			trigger: overrides?.trigger ?? createRealDispatchTriggerGateway(),
			tokens: overrides?.tokens ?? createRealDispatchLocalTokenGateway({ env: ctx.env }),
			config: overrides?.config ?? createRealDispatchConfigGateway(),
			generateAnchorId: overrides?.generateAnchorId ?? generateRealAnchorId,
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
	});
}
