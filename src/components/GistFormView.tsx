import { useRef, useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { CodeEditor } from './CodeEditor';

/** A file the form starts with (an existing gist file, when editing). */
export interface GistFormInitialFile {
  filename: string;
  content: string;
}

/**
 * A file as it stands when the form is submitted. `originalFilename` is the name
 * the file had when the form loaded (`null` for files the user added), which
 * lets callers detect renames and deletions when building an update patch.
 */
export interface GistFormResultFile {
  originalFilename: string | null;
  filename: string;
  content: string;
}

export interface GistFormData {
  description: string;
  /** Only meaningful when the visibility control is shown (creation). */
  isPublic: boolean;
  files: GistFormResultFile[];
}

interface FileDraft {
  /** Stable local key for React lists (not the filename, which can change). */
  key: number;
  /** The file's name when the form loaded; null for newly added files. */
  originalFilename: string | null;
  filename: string;
  content: string;
}

export interface GistFormViewProps {
  /** Heading shown at the top (e.g. "New gist" / "Edit gist"). */
  heading: string;
  /** Label for the submit button (e.g. "Create gist" / "Save changes"). */
  submitLabel: string;
  /** Show the public/private control. Only creation can set visibility. */
  showVisibility: boolean;
  initialDescription?: string;
  initialIsPublic?: boolean;
  /** Files to prefill. When omitted, the form starts with one empty file. */
  initialFiles?: GistFormInitialFile[];
  /** Persist the form. Should reject on failure so the message is surfaced. */
  onSubmit: (data: GistFormData) => Promise<void>;
  /** Leave the form without saving. */
  onCancel: () => void;
  /** Error banner title when `onSubmit` rejects. */
  errorTitle: string;
}

function draftsFromInitial(initialFiles: GistFormInitialFile[] | undefined): FileDraft[] {
  if (!initialFiles || initialFiles.length === 0) {
    return [{ key: 0, originalFilename: null, filename: '', content: '' }];
  }
  return initialFiles.map((f, i) => ({
    key: i,
    originalFilename: f.filename,
    filename: f.filename,
    content: f.content,
  }));
}

function validate(
  _description: string,
  files: FileDraft[],
): { ok: true; files: GistFormResultFile[] } | { ok: false; error: string } {
  const named = files.filter((f) => f.filename.trim() !== '');
  if (named.length === 0) {
    return { ok: false, error: 'Add at least one file with a name.' };
  }
  const seen = new Set<string>();
  for (const file of named) {
    const name = file.filename.trim();
    if (seen.has(name)) {
      return { ok: false, error: `Duplicate filename: ${name}` };
    }
    seen.add(name);
    if (file.content === '') {
      return { ok: false, error: `"${name}" has no content. GitHub rejects empty files.` };
    }
  }
  return {
    ok: true,
    files: named.map((f) => ({
      originalFilename: f.originalFilename,
      filename: f.filename.trim(),
      content: f.content,
    })),
  };
}

/**
 * A shared gist editor form, used for both creating and editing. Collects a
 * description and one or more files (each with a filename-highlighted CodeMirror
 * editor), and — for creation only — a public/private choice. Tracks each file's
 * original name so the caller can compute an update patch (renames/deletes).
 *
 * Purely presentational: it owns only form state and defers the network write
 * (and success navigation) to `onSubmit`.
 */
export function GistFormView({
  heading,
  submitLabel,
  showVisibility,
  initialDescription = '',
  initialIsPublic = false,
  initialFiles,
  onSubmit,
  onCancel,
  errorTitle,
}: GistFormViewProps) {
  const initialDrafts = draftsFromInitial(initialFiles);
  const nextKey = useRef(initialDrafts.length);
  const [description, setDescription] = useState(initialDescription);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [files, setFiles] = useState<FileDraft[]>(initialDrafts);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateFile = (key: number, patch: Partial<FileDraft>) => {
    setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  };

  const addFile = () => {
    setFiles((prev) => [...prev, { key: nextKey.current++, originalFilename: null, filename: '', content: '' }]);
  };

  const removeFile = (key: number) => {
    setFiles((prev) => (prev.length === 1 ? prev : prev.filter((f) => f.key !== key)));
  };

  const handleSubmit = async () => {
    const result = validate(description, files);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({ description: description.trim(), isPublic, files: result.files });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: 24, flexShrink: 0 }}>
        <VStack gap={3} align="stretch">
          <HStack gap={3} align="center" justify="between">
            <Heading level={1} type="display-3">
              {heading}
            </Heading>
            <HStack gap={2} align="center">
              <Button label="Cancel" variant="ghost" onClick={onCancel} isDisabled={isSubmitting} />
              <Button
                label={submitLabel}
                variant="primary"
                onClick={() => void handleSubmit()}
                isLoading={isSubmitting}
              />
            </HStack>
          </HStack>

          {showVisibility && (
            <HStack gap={2} align="center">
              <SegmentedControl
                label="Gist visibility"
                size="sm"
                value={isPublic ? 'public' : 'private'}
                onChange={(next) => setIsPublic(next === 'public')}
              >
                <SegmentedControlItem value="private" label="Private" />
                <SegmentedControlItem value="public" label="Public" />
              </SegmentedControl>
              <Badge label={isPublic ? 'Public' : 'Private'} variant={isPublic ? 'warning' : 'neutral'} />
              <Text type="supporting" color="secondary" as="span">
                {isPublic
                  ? 'Anyone can see this gist. Visibility is fixed after creation.'
                  : 'Only you can see this gist. Visibility is fixed after creation.'}
              </Text>
            </HStack>
          )}
        </VStack>
      </div>

      <Divider />

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 24 }}>
        <VStack gap={3} align="stretch">
          {error !== null && <Banner status="error" title={errorTitle} description={error} />}

          <TextInput
            label="Description"
            isOptional
            placeholder="What is this gist about?"
            value={description}
            onChange={setDescription}
          />

          {files.map((file, index) => (
            <Card key={file.key} padding={3}>
              <VStack gap={2} align="stretch">
                <HStack gap={2} align="end" justify="between">
                  <TextInput
                    label={`File ${index + 1} name`}
                    placeholder="e.g. example.ts"
                    value={file.filename}
                    onChange={(value) => updateFile(file.key, { filename: value })}
                    width="100%"
                  />
                  <IconButton
                    label="Remove file"
                    icon={<span aria-hidden>×</span>}
                    variant="ghost"
                    onClick={() => removeFile(file.key)}
                    isDisabled={files.length === 1}
                  />
                </HStack>
                <VStack gap={1} align="stretch">
                  <Text type="label" as="span">
                    Content
                  </Text>
                  <div
                    style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}
                  >
                    <CodeEditor
                      filename={file.filename}
                      value={file.content}
                      onChange={(value) => updateFile(file.key, { content: value })}
                      placeholder="File contents…"
                      ariaLabel={`Content for ${file.filename.trim() || `file ${index + 1}`}`}
                    />
                  </div>
                </VStack>
              </VStack>
            </Card>
          ))}

          <div>
            <Button label="Add file" icon={<span aria-hidden>+</span>} onClick={addFile} />
          </div>
        </VStack>
      </div>
    </div>
  );
}
