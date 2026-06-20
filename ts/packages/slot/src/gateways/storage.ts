import { ensurePrivateDirectory } from "@sdl/core/xdg";

export interface SlotStorageGateway {
	ensureDir(path: string): Promise<void>;
}

export class RealSlotStorageGateway implements SlotStorageGateway {
	async ensureDir(path: string): Promise<void> {
		await ensurePrivateDirectory(path);
	}
}
