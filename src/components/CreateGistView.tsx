import type { NewGistInput } from '../lib/github';
import { GistFormView } from './GistFormView';

export interface CreateGistViewProps {
  /**
   * Create the gist. Should reject on failure — the form surfaces the message
   * and stays intact so the user can retry.
   */
  onSubmit: (input: NewGistInput) => Promise<void>;
  /** Leave the create view without creating anything. */
  onCancel: () => void;
}

/**
 * The create-gist screen: a `GistFormView` with the public/private control
 * shown (visibility can only be set at creation). Maps the generic form result
 * to a `NewGistInput`.
 */
export function CreateGistView({ onSubmit, onCancel }: CreateGistViewProps) {
  return (
    <GistFormView
      heading="New gist"
      submitLabel="Create gist"
      showVisibility
      errorTitle="Couldn't create gist"
      onCancel={onCancel}
      onSubmit={(data) =>
        onSubmit({
          description: data.description,
          isPublic: data.isPublic,
          files: data.files.map((f) => ({ filename: f.filename, content: f.content })),
        })
      }
    />
  );
}
