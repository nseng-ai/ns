import { managedRegionBounds } from "@sdl/core/managed-region";
import { resultErr, type Result } from "@sdl/core/result";

export interface ManagedMarkers {
	start: string;
	end: string;
}

export function managedBlockBounds(
	content: string,
	markers: ManagedMarkers,
	pathLabel: string,
): Result<{ start: number; end: number } | null> {
	const bounds = managedRegionBounds({
		text: content,
		startMarker: markers.start,
		endMarker: markers.end,
	});
	if (bounds.type === "missing") return { ok: true, value: null };
	if (bounds.type === "malformed")
		return resultErr({
			code: "managed_block_malformed",
			message: `${pathLabel} has a malformed areg-managed block. Fix the markers manually.`,
		});
	return { ok: true, value: { start: bounds.start, end: bounds.end } };
}

export function appendBlock(content: string, block: string): string {
	if (content.length === 0) return `${block}\n`;
	if (content.endsWith("\n\n")) return `${content}${block}\n`;
	if (content.endsWith("\n")) return `${content}\n${block}\n`;
	return `${content}\n\n${block}\n`;
}

export function contentWithoutManagedBlock(
	content: string,
	markers: ManagedMarkers,
	pathLabel: string,
): Result<string> {
	const bounds = managedBlockBounds(content, markers, pathLabel);
	if (!bounds.ok) return bounds;
	if (bounds.value === null) return { ok: true, value: content };
	return {
		ok: true,
		value: `${content.slice(0, bounds.value.start)}${content.slice(bounds.value.end)}`,
	};
}
