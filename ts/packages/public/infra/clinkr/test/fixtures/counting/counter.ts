/**
 * Module-scope mutable state shared with tests through the Vitest module
 * cache (`isolate: false`). Tests must assert deltas, never absolutes.
 */
export const counter = { handlerCalls: 0 };
