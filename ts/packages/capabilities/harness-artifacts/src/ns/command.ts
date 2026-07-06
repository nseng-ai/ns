import {
	createNsDomainCommand,
	type NsDomainCommandOptions,
} from "@nseng-ai/capability-kit/ns-command";
import type { NsCommand, NsCommandSchema } from "@nseng-ai/kernel/sdk";

import type { SkillsCommandContext } from "./skills-operations.ts";

type HarnessArtifactsNsCommandOptions<S extends NsCommandSchema, T> = Omit<
	NsDomainCommandOptions<S, T, SkillsCommandContext>,
	"createContext"
>;

export function harnessArtifactsNsCommand<S extends NsCommandSchema, T>(
	options: HarnessArtifactsNsCommandOptions<S, T>,
): NsCommand<S, T> {
	return createNsDomainCommand({
		...options,
		createContext: (ctx) => ({
			cwd: ctx.cwd,
			...(ctx.env.HOME === undefined ? {} : { homeDir: ctx.env.HOME }),
			env: ctx.env,
		}),
	});
}
