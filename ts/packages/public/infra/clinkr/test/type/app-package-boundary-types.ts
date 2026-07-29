// Package-boundary compile evidence: implementation topology, source factories,
// module decoders, and transactional cache machinery stay private to /app.
// @ts-expect-error ClinkrTopology is package-private.
import { ClinkrTopology } from "@nseng-ai/clinkr/app";
// @ts-expect-error createFilesystemSource is package-private.
import { createFilesystemSource } from "@nseng-ai/clinkr/app";
// @ts-expect-error importSelectedCommand is package-private.
import { importSelectedCommand } from "@nseng-ai/clinkr/app";
// @ts-expect-error getOrCreateTransactional is package-private.
import { getOrCreateTransactional } from "@nseng-ai/clinkr/app";
// @ts-expect-error TopologySource is a package-private type.
import type { TopologySource } from "@nseng-ai/clinkr/app";

void ClinkrTopology;
void createFilesystemSource;
void importSelectedCommand;
void getOrCreateTransactional;
function retainPrivateTypeEvidence(_source: TopologySource<never>): void {}
void retainPrivateTypeEvidence;
