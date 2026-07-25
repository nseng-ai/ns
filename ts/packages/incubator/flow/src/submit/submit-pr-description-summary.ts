import type { SubmitPrLink } from "./gt-output.ts";

export interface SubmitPrDescriptionPreview {
	link: SubmitPrLink;
	title: string;
	descriptionFirstLine: string | undefined;
}

export interface SubmitPrDescriptionSummary {
	applied: readonly SubmitPrLink[];
	previews: readonly SubmitPrDescriptionPreview[];
}
