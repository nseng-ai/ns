import {
	NodeBrmemSourceReader,
	RealGitBrmemGateway,
	type BrmemGateway,
	type BrmemSourceReader,
} from "@ji/brmem";
import { createSdlClinkrInteraction, SdlStdinCapableCommandExecApi } from "@ji/capability-kit";
import { optionalEntries } from "@ji/core/primitives";
import { createSdlGitGateway } from "@ji/capability-kit/git";
import type { ClinkrInteraction, ConfirmationRequest } from "@ji/clinkr";
import type { GitGateway } from "@ji/capability-kit/git";
import type { SdlExtensionApi } from "@ji/kernel/sdk";

import type { HandoffCliContext } from "../core/context.ts";

interface HandoffSdlExtensionOverrides {
	brmem?: BrmemGateway;
	git?: GitGateway;
	sourceReader?: BrmemSourceReader;
	interaction?: ClinkrInteraction;
}

export async function createSdlHandoffContext(ctx: SdlExtensionApi): Promise<HandoffCliContext> {
	const overrides = readHandoffOverrides(ctx);
	const git = overrides?.git ?? createSdlGitGateway(ctx);
	const brmem =
		overrides?.brmem ??
		new RealGitBrmemGateway({
			cwd: ctx.cwd,
			commands: new SdlStdinCapableCommandExecApi(ctx),
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
			createSdlClinkrInteraction(ctx, {
				title: "Handoff confirmation",
				formatMessage: formatConfirmationMessage,
			}),
		stderr,
	};
}

function readHandoffOverrides(ctx: SdlExtensionApi): HandoffSdlExtensionOverrides | undefined {
	const raw = ctx.extensions?.handoff;
	if (raw === undefined || raw === null || typeof raw !== "object") return undefined;
	const overrides = raw as Partial<HandoffSdlExtensionOverrides>;
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
