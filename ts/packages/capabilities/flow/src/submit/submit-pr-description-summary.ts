import type { SubmitPrLink } from "./gt-output.ts";

export interface SubmitPrDescriptionPreview {
	link: SubmitPrLink;
	title: string;
	descriptionFirstLine: string | undefined;
}

export interface SubmitPrDescriptionSummary {
	generated: readonly SubmitPrLink[];
	skipped: readonly SubmitPrLink[];
	prewritten: readonly SubmitPrLink[];
	prewriteFallbacks: readonly SubmitPrLink[];
	previews: readonly SubmitPrDescriptionPreview[];
}
