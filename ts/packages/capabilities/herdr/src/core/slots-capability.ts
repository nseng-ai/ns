/**
 * Herdr-owned predicate answering whether compact Slot label enrichment is
 * available for the given cwd.
 *
 * Capability availability is a separate fact from managed-Slot path shape
 * (`slotLabelInput()`); label call sites must require both before prefixing.
 * Implementations must never throw: any inability to confirm presence —
 * unknown command, nonzero exit, timeout, or execution failure — resolves to
 * `false` so label enrichment degrades silently.
 */
export type HasHerdrSlotsCapability = (cwd: string) => Promise<boolean>;
