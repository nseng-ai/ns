import type {
	GsLocalInventoryGateway,
	GsLocalInventoryOptions,
	GsLocalInventoryResult,
} from "../local-inventory.ts";
import { copyGsLocalInventory } from "../local-inventory.ts";

export class InMemoryGsLocalInventoryGateway implements GsLocalInventoryGateway {
	private readonly state: GsLocalInventoryResult;

	constructor(state: GsLocalInventoryResult) {
		this.state = copyResult(state);
	}

	async readLocalInventory(_options: GsLocalInventoryOptions): Promise<GsLocalInventoryResult> {
		return copyResult(this.state);
	}
}

function copyResult(result: GsLocalInventoryResult): GsLocalInventoryResult {
	if (result.ok) return { ok: true, value: copyGsLocalInventory(result.value) };
	return {
		ok: false,
		error: {
			type: result.error.type,
			message: result.error.message,
		},
	};
}
