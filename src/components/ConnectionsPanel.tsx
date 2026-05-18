import { useTranslation } from 'react-i18next';
import { ConnectionInfo, ConnectionStatus } from '../lib/connections';
import { formatDateTime } from '../lib/format';
import { usePreferences } from '../hooks/usePreferences';
import Card from './ui/Card';
import Badge from './ui/Badge';
import Button from './ui/Button';
import { cn } from '../lib/cn';

interface Props {
  connections: ConnectionInfo[];
  compact?: boolean;
  onConnect?: (id: string) => void;
}

const statusVariant: Record<ConnectionStatus, 'status' | 'warning' | 'default'> = {
  connected: 'status',
  waiting: 'warning',
  paused: 'default',
  error: 'default',
  disconnected: 'default',
};

const statusColor: Record<ConnectionStatus, string> = {
  connected: 'bg-emerald-50 text-status-success',
  waiting: 'bg-amber-50 text-status-warning',
  paused: 'bg-surface-muted text-ink-muted',
  error: 'bg-red-50 text-status-error',
  disconnected: 'bg-surface-muted text-ink-muted',
};

export default function ConnectionsPanel({ connections, compact, onConnect }: Props) {
  const { t } = useTranslation();
  const { locale } = usePreferences();

  const statusLabel = (status: ConnectionStatus) =>
    t(`connections.${status}`);

  const sourceLabel = (id: string) =>
    t(`connections.${id}`);

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {connections.map((c) => (
          <span
            key={c.id}
            className={cn(
              'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
              statusColor[c.status],
            )}
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                c.status === 'connected' ? 'bg-status-success' : 'bg-ink-faint',
              )}
            />
            {sourceLabel(c.id)}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {connections.map((c) => (
        <Card key={c.id} padding="md" className="!p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink text-sm">{sourceLabel(c.id)}</p>
              <p className="text-xs text-ink-muted mt-0.5">
                {c.lastSynced
                  ? t('connections.lastSynced', {
                      date: formatDateTime(c.lastSynced, locale),
                    })
                  : t('connections.neverSynced')}
              </p>
            </div>
            <Badge
              variant={statusVariant[c.status]}
              className={statusColor[c.status]}
            >
              {statusLabel(c.status)}
            </Badge>
          </div>
          {c.status === 'disconnected' && c.id !== 'receipt' && (
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              className="mt-3"
              onClick={() => onConnect?.(c.id)}
            >
              {c.id === 'bank'
                ? t('connections.connectBank')
                : t('connections.connectEmail')}
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}

