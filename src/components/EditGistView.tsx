import type { GistFileContent, GistRecord } from '../lib/db';
import type { GistFilePatch, UpdateGistInput } from '../lib/github';
import { GistFormView, type GistFormResultFile } from './GistFormView';

export interface EditGistViewProps {
  /** The gist being edited (its description prefills the form). */
  gist: GistRecord;
  /** The gist's current file contents (already loaded), used to prefill files. */
  files: GistFileContent[];
  /**
   * Persist the edit. Should reject on failure — the form surfaces the message
   * and stays intact so the user can retry.
   */
  onSubmit: (input: UpdateGistInput) => Promise<void>;
  /** Leave the edit view without saving. */
  onCancel: () => void;
}

/**
 * Turn the form result into a GitHub files patch. Deleted files (original names
 * no longer present) map to `null`; renamed files carry a new `filename`; every
 * kept file sends its (possibly unchanged) content; added files are keyed by
 * their new name.
 */
function buildFilesPatch(
  originalFilenames: string[],
  resultFiles: GistFormResultFile[],
): GistFilePatch {
  const patch: GistFilePatch = {};

  const keptOriginals = new Set(
    resultFiles.map((f) => f.originalFilename).filter((name): name is string => name !== null),
  );
  for (const name of originalFilenames) {
    if (!keptOriginals.has(name)) patch[name] = null;
  }

  for (const file of resultFiles) {
    if (file.originalFilename === null) {
      patch[file.filename] = { content: file.content };
      continue;
    }
    const entry: { filename?: string; content: string } = { content: file.content };
    if (file.filename !== file.originalFilename) entry.filename = file.filename;
    patch[file.originalFilename] = entry;
  }

  return patch;
}

/**
 * The edit-gist screen: a `GistFormView` prefilled from the gist, without the
 * visibility control (GitHub can't change an existing gist's visibility).
 * Computes a minimal files patch (renames/deletes/adds) for `onSubmit`.
 */
export function EditGistView({ gist, files, onSubmit, onCancel }: EditGistViewProps) {
  const originalFilenames = files.map((f) => f.filename);
  return (
    <GistFormView
      heading="Edit gist"
      submitLabel="Save changes"
      showVisibility={false}
      errorTitle="Couldn't save changes"
      initialDescription={gist.description}
      initialFiles={files.map((f) => ({ filename: f.filename, content: f.content }))}
      onCancel={onCancel}
      onSubmit={(data) =>
        onSubmit({
          description: data.description,
          files: buildFilesPatch(originalFilenames, data.files),
        })
      }
    />
  );
}
