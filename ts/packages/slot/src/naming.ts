export const SLOT_NAME_PREFIX = "slot";

export function generateSlotName(slotNumber: number): string {
	return `${SLOT_NAME_PREFIX}-${String(slotNumber).padStart(2, "0")}`;
}

export function extractSlotNumber(name: string): string | null {
	const prefix = `${SLOT_NAME_PREFIX}-`;
	if (!name.startsWith(prefix)) return null;
	const suffix = name.slice(prefix.length);
	if (suffix.length !== 2) return null;
	if (!/^\d{2}$/.test(suffix)) return null;
	return suffix;
}
