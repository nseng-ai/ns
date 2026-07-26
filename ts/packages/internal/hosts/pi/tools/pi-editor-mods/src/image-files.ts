import { statSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";

import type { ImageContent } from "@earendil-works/pi-ai";

export interface ImageFileGateway {
	isSupportedImage(path: string): boolean;
	readImage(path: string): Promise<ImageContent | undefined>;
}

const MIME_TYPES: Readonly<Record<string, string>> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
};

export function mimeTypeForPath(path: string): string | undefined {
	return MIME_TYPES[extname(path).toLowerCase()];
}

export function createNodeImageFileGateway(): ImageFileGateway {
	return {
		isSupportedImage(path) {
			if (mimeTypeForPath(path) === undefined) return false;
			try {
				return statSync(path).isFile();
			} catch {
				return false;
			}
		},
		async readImage(path) {
			const mimeType = mimeTypeForPath(path);
			if (mimeType === undefined) return undefined;
			try {
				const metadata = await stat(path);
				if (!metadata.isFile()) return undefined;
				const data = await readFile(path);
				return { type: "image", data: data.toString("base64"), mimeType };
			} catch {
				// Files can disappear between editor compaction and submission.
				return undefined;
			}
		},
	};
}
