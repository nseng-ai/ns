// Entrypoint wiring for the dispatch ns commands (inversion rule in
// `docs/conventions/consumer-gateways-and-command-shape.md`): the command
// context binds every real gateway to the caller's command and interaction
// channels. Scenario tests inject a complete context through the command factory.
import {
	createNsClinkrInteraction,
	createNsCommandRunner,
	NsCommandExecApi,
} from "@nseng-ai/capability-kit";
import { createFlowMinimalSubmitClient } from "@nseng-ai/flow/api";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import { systemClock } from "@nseng-ai/foundation/time";
import type { NsCommandIo, NsExtensionApi } from "@nseng-ai/sdk";

import type { DispatchPromptGateways } from "./contracts.ts";
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

export interface DispatchPromptCliContext {
	readonly cwd: string;
	readonly gateways: DispatchPromptGateways;
	readonly commandIo: NsCommandIo;
}

export function createDispatchPromptContext(ctx: NsExtensionApi): DispatchPromptCliContext {
	const runner = createNsCommandRunner(ctx);
	const execApi = new NsCommandExecApi(ctx);
	const localGitFacts = new RealGitGateway(execApi);
	const flow = createFlowMinimalSubmitClient({ cwd: ctx.cwd, commands: execApi, env: ctx.env });
	const interaction = createNsClinkrInteraction(ctx, {
		title: "Graphite source publication",
	});
	return {
		cwd: ctx.cwd,
		commandIo: ctx.commandIo,
		gateways: {
			git: createRealDispatchWorkspaceGitGateway(localGitFacts, runner),
			sourcePublication: createRealDispatchSourcePublicationGateway(flow),
			publicationAuthorization:
				createRealDispatchGraphitePublicationAuthorizationGateway(interaction),
			anchorPrs: createRealDispatchAnchorPrGateway(runner),
			trigger: createRealDispatchTriggerGateway(),
			tokens: createRealDispatchLocalTokenGateway({ env: ctx.env }),
			config: createRealDispatchConfigGateway(),
			semanticSlugs: createRealDispatchContentSlugGateway(execApi),
			clock: systemClock,
		},
	};
}
