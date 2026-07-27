/**
 * Requests observed by the schema-policy handler, shared with tests through
 * the Vitest module cache (`isolate: false`). The array grows across tests;
 * assert on the entry a test itself appended, never on absolute length.
 */
export const requests: unknown[] = [];
