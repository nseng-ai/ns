export interface PickupHandoffArgs {
	help: boolean;
	branch?: string;
	selector: string[];
}

export interface ListHandoffArgs {
	help: boolean;
	branch?: string;
	allBranches: boolean;
}

export interface HandoffListItem {
	branch: string;
	key: string;
	slug: string;
}

export interface HandoffListMessageItem extends HandoffListItem {
	preview: string;
}

export type HandoffListMode = "branch" | "all-branches";

export interface HandoffListMessageDetails {
	mode: HandoffListMode;
	branch?: string;
	items: HandoffListMessageItem[];
}

export interface HandoffListBranchGroup {
	branch: string;
	items: Array<{
		index: number;
		item: HandoffListMessageItem;
	}>;
}

export type PreviewedHandoffListItem = HandoffListMessageItem;

export type HandoffArgsParseResult<T> = { type: "valid"; args: T } | { type: "invalid"; message: string };

export type HandoffItemsParseResult = { type: "valid"; items: HandoffListItem[] } | { type: "invalid"; message: string };

export type HandoffKeysParseResult = { type: "valid"; keys: string[] } | { type: "invalid"; message: string };

export type HandoffItemsLoadResult = { type: "loaded"; items: HandoffListItem[] } | { type: "failed"; message: string };
