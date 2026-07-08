import { useState } from 'react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Center } from '@astryxdesign/core/Center';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { gistTitle, type GistFileContent, type GistRecord } from '../lib/db';
import { CodeView } from './CodeView';
import { MarkdownView } from './MarkdownView';
import { isMarkdownFilename } from './codeLanguage';
import { HiOutlinePencil } from "react-icons/hi2";
import { HiOutlineTrash } from "react-icons/hi2";



export interface GistDetailProps {
  /** The currently opened gist, or null for the empty state. */
  gist: GistRecord | null;
  /** Cached file contents; undefined until the first fetch resolves. */
  files: GistFileContent[] | undefined;
  /** True when nothing is cached yet to display. */
  isLoading: boolean;
  /** True when cached content is shown while a newer revision loads. */
  isRefreshing: boolean;
  /** A load/refresh failure. Cached content, if present, is still shown. */
  error: string | null;
  /** Invoked when the Edit button is pressed. */
  onEdit?: (gist: GistRecord) => void;
  /**
   * Permanently delete the gist (on GitHub and locally). Called only after the
   * user confirms. Should reject on failure so the dialog can surface it.
   */
  onDelete: (gist: GistRecord) => void | Promise<void>;
}

/**
 * The detail column. Shows the opened gist's description, an edit action, a
 * read-only public/private badge, and its files rendered in collapsible
 * CodeMirror views. Empty when nothing is open.
 *
 * Visibility is fixed at creation (GitHub's API can't change an existing gist's
 * visibility), so it is shown here as a badge only — it is chosen on the create
 * screen instead.
 *
 * Purely presentational: file contents (and their loading state) are supplied
 * by the caller via `useGistFiles`, which serves them cache-first.
 */
export function GistDetail({
  gist,
  files,
  isLoading,
  isRefreshing,
  error,
  onEdit,
  onDelete,
}: GistDetailProps) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!gist) {
    return (
      <Center axis="both" height="100%">
        <EmptyState
          title="Add a new Gist"
          description="Select a gist from the list to view it, or create one to get started."
        />
      </Center>
    );
  }

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(gist);
      setIsConfirmingDelete(false);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: 24, flexShrink: 0 }}>
        <VStack gap={3} align="stretch">
          <HStack gap={3} align="start" justify="between">
            <Heading level={1} type="display-3" maxLines={2}>
              {gistTitle(gist)}
            </Heading>
            <HStack gap={2} align="center">
              <Button label="Edit" icon={
                <HiOutlinePencil size={12} />
              } onClick={() => onEdit?.(gist)} />
              <IconButton
                label="Delete gist"
                icon={
                  <HiOutlineTrash size={12} />
                }
                variant="destructive"
                onClick={() => {
                  setDeleteError(null);
                  setIsConfirmingDelete(true);
                }}
              />
            </HStack>
          </HStack>

          {deleteError !== null && (
            <Banner status="error" title="Couldn't delete gist" description={deleteError} />
          )}

          <HStack gap={2} align="center">
            <Badge
              label={gist.isPublic ? 'Public' : '🔐 Private'}
              variant={gist.isPublic ? 'warning' : 'neutral'}
            />
            {isRefreshing && (
              <HStack gap={1} align="center">
                <Spinner size="sm" aria-label="Checking for a newer version" />
                <Text type="supporting" color="secondary" as="span">
                  Updating…
                </Text>
              </HStack>
            )}
          </HStack>
        </VStack>
      </div>

      <Divider />

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 24 }}>
        {files === undefined ? (
          error !== null ? (
            <Banner status="error" title="Couldn't load files" description={error} />
          ) : (
            isLoading && (
              <Center axis="both" height="100%">
                <Spinner label="Loading files…" />
              </Center>
            )
          )
        ) : (
          <VStack gap={2} align="stretch">
            {error !== null && (
              <Banner
                status="warning"
                title="Showing the cached copy"
                description={`Couldn't check for a newer version: ${error}`}
              />
            )}
            {files.length === 0 ? (
              <EmptyState isCompact title="This gist has no files" />
            ) : (
              files.map((file) => (
                <Card key={file.filename} padding={0}
                >
                  <Collapsible
                    className="gist-collapsible-trigger"
                    defaultIsOpen
                    trigger={
                      <HStack gap={2} align="center" style={{
                        // marginLeft: '8px',
                        // marginTop: '4px',
                      }}>
                        <Text type="label" as="span">
                          {file.filename}
                        </Text>
                        {file.language && (
                          <Text type="supporting" color="secondary" as="span">
                            {file.language}
                          </Text>
                        )}
                      </HStack>
                    }
                  >
                    {isMarkdownFilename(file.filename) ? (
                      <MarkdownView content={file.content} />
                    ) : (
                      <CodeView filename={file.filename} content={file.content} />
                    )}
                  </Collapsible>
                </Card>
              ))
            )}
          </VStack>
        )}
      </div>

      <AlertDialog
        isOpen={isConfirmingDelete}
        onOpenChange={(open) => {
          if (!isDeleting) setIsConfirmingDelete(open);
        }}
        title="Delete this gist?"
        description={`"${gistTitle(gist)}" and all of its files will be permanently deleted from GitHub. This can't be undone.`}
        cancelLabel="Cancel"
        actionLabel="Delete"
        actionVariant="destructive"
        isActionLoading={isDeleting}
        onAction={() => void handleDelete()}
      />
    </div>
  );
}
