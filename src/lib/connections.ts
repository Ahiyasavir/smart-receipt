import { Receipt } from '../types';

export type ConnectionStatus =
  | 'connected'
  | 'waiting'
  | 'paused'
  | 'error'
  | 'disconnected';

export type ConnectionId = 'receipt' | 'bank' | 'email';

export interface ConnectionInfo {
  id: ConnectionId;
  status: ConnectionStatus;
  lastSynced?: string;
}

export function getConnectionStates(receipts: Receipt[]): ConnectionInfo[] {
  const latestReceipt = receipts.length
    ? receipts.reduce((a, b) =>
        new Date(a.date) > new Date(b.date) ? a : b,
      )
    : null;

  return [
    {
      id: 'receipt',
      status: 'connected',
      lastSynced: latestReceipt?.date,
    },
    {
      id: 'bank',
      status: 'disconnected',
    },
    {
      id: 'email',
      status: 'disconnected',
    },
  ];
}

export function hasActiveSync(connections: ConnectionInfo[]): boolean {
  return connections.some((c) => c.status === 'connected');
}
