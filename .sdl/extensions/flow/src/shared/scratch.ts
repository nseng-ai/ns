import { withTemporaryFile } from "@sdl/sdl/temp-files";
import type { TemporaryFileOptions } from "@sdl/sdl/temp-files";

export type FlowTemporaryFileOptions = TemporaryFileOptions;

export async function withFlowTemporaryFile<T>(
  options: FlowTemporaryFileOptions,
  callback: (path: string) => Promise<T>,
): Promise<T> {
  return await withTemporaryFile(options, callback);
}
