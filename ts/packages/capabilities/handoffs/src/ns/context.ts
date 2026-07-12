import {
	NodeBrmemSourceReader,
	RealGitBrmemGateway,
	type BrmemGateway,
	type BrmemSourceReader,
} from "@nseng-ai/brmem";
import { createNsClinkrInteraction, NsStdinCapableCommandExecApi } from "@nseng-ai/capability-kit";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { createNsGitGateway } from "@nseng-ai/capability-kit";
import type { ClinkrInteraction, ConfirmationRequest } from "@nseng-ai/clinkr";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import type { HandoffCliContext } from "../core/context.ts";

interface HandoffNsExtensionOverrides {
	brmem?: BrmemGateway;
	git?: GitGateway;
	sourceReader?: BrmemSourceReader;
	interaction?: ClinkrInteraction;
}

export async function createNsHandoffContext(ctx: NsExtensionApi): Promise<HandoffCliContext> {
	const overrides = readHandoffOverrides(ctx);
	const git = overrides?.git ?? createNsGitGateway(ctx);
	const brmem =
		overrides?.brmem ??
		new RealGitBrmemGateway({
			cwd: ctx.cwd,
			commands: new NsStdinCapableCommandExecApi(ctx),
			git,
		});
	const stderr = ctx.stderr ?? (() => {});
	return {
		cwd: ctx.cwd,
		env: ctx.env as NodeJS.ProcessEnv,
		git,
		brmem,
		sourceReader: overrides?.sourceReader ?? new NodeBrmemSourceReader(),
		interaction:
			overrides?.interaction ??
			createNsClinkrInteraction(ctx, {
				title: "Handoff confirmation",
				formatMessage: formatConfirmationMessage,
			}),
		stderr,
	};
}

function readHandoffOverrides(ctx: NsExtensionApi): HandoffNsExtensionOverrides | undefined {
	const raw = ctx.extensions?.handoff;
	if (raw === undefined || raw === null || typeof raw !== "object") return undefined;
	const overrides = raw as Partial<HandoffNsExtensionOverrides>;
	return optionalEntries({
		brmem: overrides.brmem,
		git: overrides.git,
		sourceReader: overrides.sourceReader,
		interaction: overrides.interaction,
	});
}

function formatConfirmationMessage(request: ConfirmationRequest): string {
	const defaultLine =
		request.defaultAnswer === "yes"
			? "Default: yes (press enter to confirm)."
			: "Default: no (press enter to cancel).";
	return `${request.message}\n\n${defaultLine}`;
}
