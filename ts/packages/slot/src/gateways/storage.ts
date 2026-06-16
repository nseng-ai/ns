import { mkdir } from "node:fs/promises";

export interface SlotStorageGateway {
	ensureDir(path: string): Promise<void>;
}

export class RealSlotStorageGateway implements SlotStorageGateway {
	async ensureDir(path: string): Promise<void> {
		await mkdir(path, { recursive: true });
	}
}
