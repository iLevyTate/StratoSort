// Re-export of IPC channel definitions for TypeScript consumers.
// This keeps a single source of truth: constants.js remains the canonical list
// used by the main & preload (CommonJS) code, while TS/React code can now
// import from this file to get typing support via typeof.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - allow importing CJS module in TS
import constantsJs from './constants';

// Extract with runtime value and inferred type
export const IPC_CHANNELS: typeof constantsJs.IPC_CHANNELS = constantsJs.IPC_CHANNELS;

export type IpcChannelGroups = typeof IPC_CHANNELS;
export type IpcChannel = IpcChannelGroups[keyof IpcChannelGroups][keyof IpcChannelGroups[keyof IpcChannelGroups]]; 