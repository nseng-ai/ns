export { isRecord } from "@sdl/core/primitives";

export type TextResult =
	| {
			ok: true;
			text: string;
	  }
	| {
			ok: false;
			message: string;
	  };

export function stringField(
	record: Record<string, unknown> | undefined,
	key: string,
): string | undefined {
	const value = record?.[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}
