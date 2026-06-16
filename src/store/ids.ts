/** Centralized id generators shared across the store and its factories. */
export function uuid(): string { return crypto.randomUUID(); }
export function generateIfid(): string { return uuid().toUpperCase(); }
