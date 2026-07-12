import { NsCommandExecApi } from "@nseng-ai/capability-kit";
import { createNsDomainCommand } from "@nseng-ai/capability-kit/ns-command";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import {
	applyCmuxWorkspaceSummaryCommand,
	cmuxWorkspaceSummaryRequestSchema,
	cmuxWorkspaceSummaryResultSchema,
	renderCmuxWorkspaceSummaryHuman,
} from "../../core/workspace-summary.ts";

interface CmuxWorkspaceSummaryContext {
	commands: CommandExecApi;
	cwd: string;
	env: Record<string, string | undefined>;
}

export const cmuxWorkspaceSummaryNsCommand = createNsDomainCommand({
	name: "workspace-summary",
	summary: "Apply generated cmux workspace title and description fields.",
	description: "Apply generated cmux workspace title and description fields.",
	schema: cmuxWorkspaceSummaryRequestSchema,
	resultSchema: cmuxWorkspaceSummaryResultSchema,
	renderHuman: renderCmuxWorkspaceSummaryHuman,
	createContext: (ctx: NsExtensionApi): CmuxWorkspaceSummaryContext => ({
		commands: new NsCommandExecApi(ctx),
		cwd: ctx.cwd,
		env: ctx.env,
	}),
	handler: (ctx, request) =>
		applyCmuxWorkspaceSummaryCommand({
			request,
			commands: ctx.commands,
			cwd: ctx.cwd,
			env: ctx.env,
		}),
});

export default cmuxWorkspaceSummaryNsCommand;
