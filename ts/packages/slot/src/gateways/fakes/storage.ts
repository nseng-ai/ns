import type { SlotStorageGateway } from "../storage.ts";

export interface FakeSlotStorageOperation {
	type: "ensure-dir";
	path: string;
}

export class FakeSlotStorageGateway implements SlotStorageGateway {
	private readonly log: FakeSlotStorageOperation[] = [];

	async ensureDir(path: string): Promise<void> {
		this.log.push({ type: "ensure-dir", path });
	}

	operations(): readonly FakeSlotStorageOperation[] {
		return this.log.map((operation) => ({ ...operation }));
	}
}
