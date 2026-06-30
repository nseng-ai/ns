import { ensurePrivateDirectory } from "@sdl/capability-kit/xdg";

export interface SlotStorageGateway {
	ensureDir(path: string): Promise<void>;
}

export class RealSlotStorageGateway implements SlotStorageGateway {
	async ensureDir(path: string): Promise<void> {
		await ensurePrivateDirectory(path);
	}
}
