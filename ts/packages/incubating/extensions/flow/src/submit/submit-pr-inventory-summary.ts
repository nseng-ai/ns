import type { SubmitPrLink } from "./gt-output.ts";

export interface SubmitPrInventoryPreview {
	link: SubmitPrLink;
	title: string;
	inventoryFirstLine: string | undefined;
}

export interface SubmitPrInventorySummary {
	applied: readonly SubmitPrLink[];
	previews: readonly SubmitPrInventoryPreview[];
}
