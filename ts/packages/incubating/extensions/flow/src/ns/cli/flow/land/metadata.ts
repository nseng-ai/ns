import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			'Without [workflow].stack-provider, land the current branch\'s GitHub PR into Git trunk. With stack-provider = "graphite", land the current Graphite stack into trunk.',
		summary: "Land the configured current-PR or Graphite-stack target into trunk.",
	};
}
