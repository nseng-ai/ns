import type { ActiveOperation } from "@nseng-ai/kernel/sdk";

export interface SubmitProgressListeners<ItemProgressEvent> {
	onProgress?: (message: string) => void;
	onActiveOperations?: (operations: readonly ActiveOperation[]) => void;
	onItemProgress?: (event: ItemProgressEvent) => void;
}
