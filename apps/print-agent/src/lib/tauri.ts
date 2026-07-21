import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AppSnapshot, SettingsInput } from '../types';

export const getState = () => invoke<AppSnapshot>('get_state');

export const pair = (apiUrl: string, code: string) => invoke<AppSnapshot>('pair', { apiUrl, code });

export const connect = () => invoke<void>('connect');
export const disconnect = () => invoke<void>('disconnect');
export const pause = () => invoke<void>('pause');
export const resume = () => invoke<void>('resume');
export const reprocess = () => invoke<void>('reprocess');

export const testPrint = (target: 'pickup' | 'shipping') => invoke<void>('test_print', { target });

export const listPrinters = () => invoke<string[]>('list_printers');

export const saveSettings = (input: SettingsInput) =>
  invoke<AppSnapshot>('save_settings', { input });

export const openLogsFolder = () => invoke<void>('open_logs_folder');

/** Ouve `state-changed` (emitido pelo Rust sempre que algo muda) e chama `onSnapshot`. */
export const onStateChanged = (onSnapshot: (snapshot: AppSnapshot) => void) =>
  listen<AppSnapshot>('state-changed', (event) => onSnapshot(event.payload));
