import type { ClinkrIo } from "@asdl/clinkr";

export interface PackagechkIo extends ClinkrIo {
	stdin(): Promise<string | null>;
}
