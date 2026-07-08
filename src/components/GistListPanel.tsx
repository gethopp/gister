import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { Item } from '@astryxdesign/core/Item';
import { List } from '@astryxdesign/core/List';
import { Text } from '@astryxdesign/core/Text';
import { AccountFooter, type AccountFooterProps } from './AccountFooter';
import { gistTitle, type GistRecord } from '../lib/db';

export interface GistListPanelProps extends AccountFooterProps {
  /** undefined while Dexie is still answering the first query. */
  gists: GistRecord[] | undefined;
  selectedGistId: string | null;
  onSelectGist: (id: string) => void;
  /** Open the create-gist screen. */
  onNewGist: () => void;
  syncError: string | null;
}

/**
 * The left column: a scrollable list of every gist (shown by description) with
 * the signed-in account block pinned to the bottom. Selecting a gist opens it
 * in the detail column.
 */
export function GistListPanel({
  gists,
  selectedGistId,
  onSelectGist,
  onNewGist,
  syncError,
  profile,
  lastSyncAt,
  isSyncing,
  onRefresh,
  onLogout,
  onOpenSearch,
  isUpdateAvailable,
  onUpdate,
}: GistListPanelProps) {
  const isEmpty = gists && gists.length === 0;

  return (
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        borderRight: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-background-surface)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 56,
          boxSizing: 'border-box',
          padding: '16px 16px 12px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        <Heading level={2} type="display-3">
          Gists
        </Heading>
        {gists && (
          <Text
            type="supporting"
            color="secondary"
            as="span"
            style={{
              marginTop: '3px',
            }}
          >
            {gists.length}
          </Text>
        )}
        {isSyncing && <span className="gist-spinner" role="status" aria-label="Syncing gists" />}
        <div style={{ marginLeft: 'auto' }}>
          <Button
            label="New"
            size="sm"
            variant="secondary"
            icon={
              <span aria-hidden style={{ marginBottom: 2 }}>
                +
              </span>
            }
            onClick={onNewGist}
          />
        </div>
      </div>

      {syncError && (
        <div style={{ padding: '8px 16px', flexShrink: 0 }}>
          <Text type="supporting" color="secondary" as="p">
            Sync failed: {syncError}
          </Text>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8 }}>
        {isEmpty && !isSyncing ? (
          <div style={{ padding: 16 }}>
            <EmptyState
              isCompact
              title="No gists yet"
              description="Gists you create on GitHub show up here after a sync."
            />
          </div>
        ) : (
          <List density="compact">
            {(gists ?? []).map((gist) => (
              <Item
                key={gist.id}
                as="li"
                label={gistTitle(gist)}
                labelLines={2}
                description={`${gist.files.length} file${gist.files.length === 1 ? '' : 's'}`}
                descriptionLines={1}
                isSelected={gist.id === selectedGistId}
                onClick={() => onSelectGist(gist.id)}
              />
            ))}
          </List>
        )}
      </div>

      <AccountFooter
        profile={profile}
        lastSyncAt={lastSyncAt}
        isSyncing={isSyncing}
        onRefresh={onRefresh}
        onLogout={onLogout}
        onOpenSearch={onOpenSearch}
        isUpdateAvailable={isUpdateAvailable}
        onUpdate={onUpdate}
      />
    </aside>
  );
}
