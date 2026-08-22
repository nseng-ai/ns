import { deriveContentSlug } from "@nseng-ai/extension-kit/content-slug";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	HERDR_RESOURCE_LABEL_POLICY,
	slotLabelInputFromWorktreeRoot,
	type HerdrSlotLabelInput,
} from "@nseng-ai/herdr/api";

import type { HerdrResourceLabelDeriver } from "../core/new-space.ts";
import type { HerdrGitGateway, HerdrPiContext } from "./context.ts";

export async function resolveHerdrSlotLabelInput(
	git: Pick<HerdrGitGateway, "optionalRepoRoot">,
	cwd: string,
): Promise<HerdrSlotLabelInput> {
	const repoRoot = await git.optionalRepoRoot({ cwd });
	if (repoRoot.type !== "found") return {};
	return slotLabelInputFromWorktreeRoot(repoRoot.value);
}

export function createHerdrResourceLabelDeriver(
	context: Pick<HerdrPiContext, "commands" | "git" | "projectConfig">,
): HerdrResourceLabelDeriver {
	return {
		async deriveLabel(input) {
			const evidence = await deriveContentSlug(
				context,
				{
					content: input.description,
					cwd: input.cwd,
					...optionalEntry("signal", input.signal),
				},
				HERDR_RESOURCE_LABEL_POLICY,
			);
			return evidence;
		},
	};
}
