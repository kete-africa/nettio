import { useEffect, useState } from 'react';
import { parsePending, type PendingDeposit } from '../domain/pending';
import { weightIn } from '../domain/scale';

// What belongs to this device, not to the laundry (specs/031-device): the paper in its printer,
// its labels, its scale — and the deposits it keeps while the network is away. Kept in the
// browser: another tablet has its own.

export const papers = ['58', '80', 'a4'] as const;
export type Paper = (typeof papers)[number];

export interface DeviceSettings {
  paper: Paper;
  /** A label's size, in millimetres. */
  labelWidth: number;
  labelHeight: number;
  /** The speed the scale talks at. */
  baud: number;
}

export const bauds = [2400, 4800, 9600, 19200] as const;
const DEFAULTS: DeviceSettings = { paper: 'a4', labelWidth: 50, labelHeight: 30, baud: 9600 };
const SETTINGS = 'nettio.device';
const PENDING = 'nettio.pending';
const CHANGED = 'nettio:device';

export function readDevice(): DeviceSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const stored = JSON.parse(window.localStorage.getItem(SETTINGS) ?? '{}') as Partial<DeviceSettings>;
    return {
      paper: papers.includes(stored.paper as Paper) ? (stored.paper as Paper) : DEFAULTS.paper,
      labelWidth: Number(stored.labelWidth) >= 20 && Number(stored.labelWidth) <= 120 ? Number(stored.labelWidth) : DEFAULTS.labelWidth,
      labelHeight: Number(stored.labelHeight) >= 15 && Number(stored.labelHeight) <= 120 ? Number(stored.labelHeight) : DEFAULTS.labelHeight,
      baud: bauds.includes(stored.baud as (typeof bauds)[number]) ? Number(stored.baud) : DEFAULTS.baud,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveDevice(settings: DeviceSettings): void {
  window.localStorage.setItem(SETTINGS, JSON.stringify(settings));
  window.dispatchEvent(new Event(CHANGED));
}

/** This device's settings, read once the page is in the browser. */
export function useDevice(): DeviceSettings {
  const [settings, setSettings] = useState(DEFAULTS);
  useEffect(() => {
    const read = () => setSettings(readDevice());
    read();
    window.addEventListener(CHANGED, read);
    return () => window.removeEventListener(CHANGED, read);
  }, []);
  return settings;
}

/** The printer's page for a ticket: the paper's width, as long as the ticket. */
export const paperCss = (paper: Paper): string =>
  paper === 'a4' ? '' : `@media print { @page { size: ${paper}mm auto; margin: 2mm; } html, body { width: ${paper}mm; } }`;

export function readPending(): PendingDeposit[] {
  return typeof window === 'undefined' ? [] : parsePending(window.localStorage.getItem(PENDING));
}

export function savePending(list: PendingDeposit[]): void {
  window.localStorage.setItem(PENDING, JSON.stringify(list));
  window.dispatchEvent(new Event(CHANGED));
}

/** The deposits this device keeps, followed as they change. */
export function usePending(): PendingDeposit[] {
  const [list, setList] = useState<PendingDeposit[]>([]);
  useEffect(() => {
    const read = () => setList(readPending());
    read();
    window.addEventListener(CHANGED, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(CHANGED, read);
      window.removeEventListener('storage', read);
    };
  }, []);
  return list;
}

interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
}

/** Whether this browser can talk to a scale on a serial port. */
export const scaleIsSupported = (): boolean => typeof navigator !== 'undefined' && 'serial' in navigator;

/**
 * Reads the scale once: the person picks its port, Nettio listens for a moment and keeps the last
 * weight it said. Null when it said none. The port is closed again: nothing stays open.
 */
export async function readScale(baud: number): Promise<number | null> {
  const serial = (navigator as Navigator & { serial?: { requestPort(): Promise<SerialPortLike> } }).serial;
  if (!serial) return null;
  const port = await serial.requestPort();
  await port.open({ baudRate: baud });
  const reader = port.readable?.getReader();
  if (!reader) {
    await port.close();
    return null;
  }
  const decoder = new TextDecoder();
  let said = '';
  const until = Date.now() + 2500;
  try {
    while (Date.now() < until) {
      const wait = new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), Math.max(0, until - Date.now())),
      );
      const { value, done } = await Promise.race([reader.read(), wait]);
      if (value) said += decoder.decode(value, { stream: true });
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
    await port.close().catch(() => undefined);
  }
  return weightIn(said);
}
