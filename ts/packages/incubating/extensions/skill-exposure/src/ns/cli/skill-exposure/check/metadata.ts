import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		summary: "Check exposure overlays for explicit skill paths.",
		description:
			"Exit negatively when any selected skill is inconsistent. Missing registry evidence identifies the registration needed for a Pi-excluded skill.",
	};
}
