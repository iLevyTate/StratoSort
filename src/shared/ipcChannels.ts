// Re-export of IPC channel definitions for TypeScript consumers.
// This keeps a single source of truth: constants.js remains the canonical list
// used by the main & preload (CommonJS) code, while TS/React code can now
// import from this file to get full typing support.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { IPC_CHANNELS: JS_IPC_CHANNELS } = require('./constants');

// Retain literal property types without illegal const-assertion on a non-literal
export const IPC_CHANNELS = JS_IPC_CHANNELS as typeof JS_IPC_CHANNELS;

// Helper union types for stronger type-safety in TS codebases
export type IpcChannelGroups = typeof IPC_CHANNELS;
export type IpcChannel =
  IpcChannelGroups[keyof IpcChannelGroups][keyof IpcChannelGroups[keyof IpcChannelGroups]]; 