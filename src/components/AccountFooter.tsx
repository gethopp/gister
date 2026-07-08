import { useRef } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Button } from '@astryxdesign/core/Button';
import { Item } from '@astryxdesign/core/Item';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Popover } from '@astryxdesign/core/Popover';
import { Timestamp } from '@astryxdesign/core/Timestamp';
import { VStack } from '@astryxdesign/core/VStack';
import type { UserProfile } from '../lib/db';
import { HStack, Kbd, Text } from '@astryxdesign/core';

export interface AccountFooterProps {
  profile: UserProfile;
  lastSyncAt: string | null;
  isSyncing: boolean;
  onRefresh: () => void;
  onLogout: () => void | Promise<void>;
  /** Open the command palette (also reachable via the keyboard shortcut). */
  onOpenSearch: () => void;
  /** True when a newer app release is ready to install. */
  isUpdateAvailable?: boolean;
  /** Download and install the available update, then relaunch. */
  onUpdate?: () => void;
}

/**
 * Bottom-of-column account block: the last-sync timestamp, the signed-in user,
 * and an account menu (Sync now / Log out) anchored to the profile row.
 */
export function AccountFooter({
  profile,
  lastSyncAt,
  isSyncing,
  onRefresh,
  onLogout,
  onOpenSearch,
  isUpdateAvailable = false,
  onUpdate,
}: AccountFooterProps) {
  const profileRef = useRef<HTMLElement>(null!);

  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: '1px solid var(--color-border)',
        padding: 8,
        backgroundColor: 'var(--color-background-surface)',
      }}
    >
      {isUpdateAvailable && (
        <Button
          variant="ghost"
          label="Update available"
          onClick={onUpdate}
          style={{ width: '100%', marginBottom: '8px' }}
        />
      )}

      <Button
        variant="secondary"
        label="Search"
        style={{ width: '100%' }}
        onClick={onOpenSearch}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenSearch();
          }
        }}
      >
        <HStack justify="start" align="center" gap={3} padding={2} tabIndex={0}>
          <Text>Search</Text>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Kbd keys="mod+k" />
          </span>
        </HStack>
      </Button>
      <MetadataList columns="single" style={{ marginLeft: '8px', marginBottom: '4px' }}>
        <MetadataListItem label="Last sync">
          {lastSyncAt ? <Timestamp value={lastSyncAt} format="relative" /> : 'never'}
        </MetadataListItem>
      </MetadataList>
      <Item
        ref={profileRef}
        startContent={<Avatar src={profile.avatarUrl} name={profile.name ?? profile.login} size="small" />}
        label={profile.name ?? profile.login}
        description={profile.email ?? 'email hidden'}
        aria-label="User profile"
        onClick={() => {}}
        density="compact"
      />
      <Popover
        anchorRef={profileRef}
        label="Account menu"
        placement="above"
        alignment="start"
        hasAutoFocus={false}
        content={
          <VStack gap={0.5} align="stretch" style={{ minWidth: 176 }}>
            <Button
              label={isSyncing ? 'Syncing…' : 'Sync now'}
              variant="secondary"
              isLoading={isSyncing}
              onClick={onRefresh}
            />
            <Button label="Log out" onClick={onLogout} />
          </VStack>
        }
      />
    </div>
  );
}
