import type { ActiveOperation } from "@nseng-ai/sdk/sdk";

export interface SubmitProgressListeners<ItemProgressEvent> {
	onProgress?: (message: string) => void;
	onActiveOperations?: (operations: readonly ActiveOperation[]) => void;
	onItemProgress?: (event: ItemProgressEvent) => void;
}
