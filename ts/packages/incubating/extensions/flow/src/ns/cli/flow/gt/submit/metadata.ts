import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			"Run configured pre-submit checks, checkpoint outstanding changes, then submit the current Graphite branch and downstack ancestors with gt submit --no-edit --publish --no-stack --no-ai --no-interactive.",
		summary: "Checkpoint pending changes, then submit the Graphite stack with gt submit.",
	};
}
