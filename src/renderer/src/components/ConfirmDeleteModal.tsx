import { useState } from 'react'

interface Props {
  fileName: string
  filePath: string
  hasUnsavedEdits?: boolean
  /** Folder mode: only offers "Delete folder" (no "Remove from Library"). */
  folderMode?: boolean
  folderFileCount?: number
  onRemove?: () => void
  /** Returns an error message on failure, or null on success. */
  onDelete: () => Promise<string | null>
  onClose: () => void
}

export function ConfirmDeleteModal({
  fileName,
  filePath,
  hasUnsavedEdits,
  folderMode,
  folderFileCount,
  onRemove,
  onDelete,
  onClose
}: Props): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const del = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const err = await onDelete()
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <>
      <div className="panel-backdrop" onClick={busy ? undefined : onClose} aria-hidden="true" />
      <div className="confirm-modal" role="dialog" aria-label="Remove or delete">
        <h2 className="confirm-title">
          {folderMode ? 'Delete folder' : 'Remove'} “{fileName}”?
        </h2>
        <p className="confirm-path" title={filePath}>
          {filePath}
        </p>
        {hasUnsavedEdits && (
          <p className="confirm-warn">
            ⚠ This file is open in the editor with possible unsaved edits.
          </p>
        )}
        <div className="confirm-choices">
          {!folderMode && onRemove && (
            <button type="button" className="confirm-choice" onClick={onRemove} disabled={busy}>
              <span className="confirm-choice-title">Remove from Library</span>
              <span className="confirm-choice-desc">
                Hides it from the app only — the file stays on your disk. You can undo this.
              </span>
            </button>
          )}
          <button
            type="button"
            className="confirm-choice confirm-danger"
            onClick={() => void del()}
            disabled={busy}
          >
            <span className="confirm-choice-title">
              {busy ? 'Deleting…' : folderMode ? 'Delete folder' : 'Delete file'}
            </span>
            <span className="confirm-choice-desc">
              {folderMode
                ? `Moves the folder${
                    folderFileCount ? ` and its ${folderFileCount} file${folderFileCount === 1 ? '' : 's'}` : ''
                  } to the Recycle Bin.`
                : 'Moves the file to the Recycle Bin and removes it everywhere in the app.'}
            </span>
          </button>
        </div>
        {error && <p className="ai-error">{error}</p>}
        <div className="confirm-actions">
          <button type="button" className="btn btn-small" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}
