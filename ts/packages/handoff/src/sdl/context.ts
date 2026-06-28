import {
	NodeBrmemSourceReader,
	RealGitBrmemGateway,
	type BrmemGateway,
	type BrmemSourceReader,
} from "@sdl/brmem";
import { SdlCommandExecApi, createSdlGitGateway } from "@sdl/capability-kit";
import type { ClinkrInteraction, ConfirmationRequest } from "@sdl/clinkr";
import type { StdinCapableCommandExecApi } from "@sdl/core/exec";
import type { GitGateway } from "@sdl/core/git";
import type { SdlExtensionApi } from "sdl-sdk";

import type { HandoffCliContext } from "../context.ts";

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
		interaction: overrides?.interaction ?? createHandoffInteraction(ctx),
		stderr,
	};
}

function readHandoffOverrides(ctx: SdlExtensionApi): HandoffSdlExtensionOverrides | undefined {
	const raw = ctx.extensions?.handoff;
	if (raw === undefined || raw === null || typeof raw !== "object") return undefined;
	const overrides = raw as Partial<HandoffSdlExtensionOverrides>;
	return {
		...(overrides.brmem === undefined ? {} : { brmem: overrides.brmem }),
		...(overrides.git === undefined ? {} : { git: overrides.git }),
		...(overrides.sourceReader === undefined ? {} : { sourceReader: overrides.sourceReader }),
		...(overrides.interaction === undefined ? {} : { interaction: overrides.interaction }),
	};
}

function createHandoffInteraction(ctx: SdlExtensionApi): ClinkrInteraction {
	const confirmPrompt = ctx.confirm;
	if (confirmPrompt === undefined) {
		return {
			confirm: async () => ({ type: "aborted" as const }),
			isInteractive: () => false,
		};
	}
	return {
		confirm: async (request: ConfirmationRequest) => {
			const approved = await confirmPrompt(
				"Handoff confirmation",
				formatConfirmationMessage(request),
			);
			return approved ? { type: "confirmed" } : { type: "declined" };
		},
		isInteractive: () => true,
	};
}

class SdlStdinCapableCommandExecApi
	extends SdlCommandExecApi
	implements StdinCapableCommandExecApi
{
	readonly supportsStdin = true as const;

	constructor(ctx: SdlExtensionApi) {
		super(ctx);
	}
}

function formatConfirmationMessage(request: ConfirmationRequest): string {
	const defaultLine =
		request.defaultAnswer === "yes"
			? "Default: yes (press enter to confirm)."
			: "Default: no (press enter to cancel).";
	return `${request.message}\n\n${defaultLine}`;
}
