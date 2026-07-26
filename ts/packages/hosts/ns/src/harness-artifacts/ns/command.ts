import { createNsGitGateway } from "@nseng-ai/extension-kit";
import {
	createNsDomainCommand,
	type NsDomainCommandOptions,
} from "@nseng-ai/extension-kit/ns-command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { NsCommand, NsCommandSchema } from "@nseng-ai/sdk";

import type { SkillsCommandContext } from "./skills-shared.ts";

type HarnessArtifactsNsCommandOptions<S extends NsCommandSchema, T> = Omit<
	NsDomainCommandOptions<S, T, SkillsCommandContext>,
	"createContext"
>;

export function harnessArtifactsNsCommand<S extends NsCommandSchema, T>(
	options: HarnessArtifactsNsCommandOptions<S, T>,
): NsCommand<S, T> {
	return createNsDomainCommand({
		...options,
		createContext: async (ctx) => {
			const repoRootResult = await createNsGitGateway(ctx).optionalRepoRoot({ cwd: ctx.cwd });
			const projectRoot = repoRootResult.type === "found" ? repoRootResult.value : ctx.cwd;
			return {
				cwd: ctx.cwd,
				projectRoot,
				...optionalEntry("homeDir", ctx.homeDir),
				env: ctx.env,
			};
		},
	});
}
