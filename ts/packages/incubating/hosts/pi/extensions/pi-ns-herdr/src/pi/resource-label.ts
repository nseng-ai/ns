import { deriveContentSlug } from "@nseng-ai/extension-kit/content-slug";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	HERDR_RESOURCE_LABEL_POLICY,
	slotLabelInputFromWorktreeRoot,
	type HerdrSlotLabelInput,
} from "@nseng-ai/herdr/api";

import type { HerdrResourceLabelDeriver } from "../core/new-space.ts";
import type { HerdrGitGateway } from "./context.ts";

export async function resolveHerdrSlotLabelInput(
	git: Pick<HerdrGitGateway, "optionalRepoRoot">,
	cwd: string,
): Promise<HerdrSlotLabelInput> {
	const repoRoot = await git.optionalRepoRoot({ cwd });
	if (repoRoot.type !== "found") return {};
	return slotLabelInputFromWorktreeRoot(repoRoot.value);
}

export function createHerdrResourceLabelDeriver(
	commands: CommandExecApi,
	modelSelection: ModelSelection,
): HerdrResourceLabelDeriver {
	return {
		async deriveLabel(input) {
			return deriveContentSlug(
				commands,
				{
					content: input.description,
					cwd: input.cwd,
					modelSelection,
					...optionalEntry("signal", input.signal),
				},
				HERDR_RESOURCE_LABEL_POLICY,
			);
		},
	};
}
