import { createPortal } from 'react-dom'

// A string message is a sentence; anything else (a list of effects, say) is laid out by the caller.
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) {
  if (!open) return null

  // In the page's body: a dialog opened from inside a drawer, or a list that fades
  // or scrolls, would otherwise be clipped to it.
  return createPortal(
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        {title && <h3>{title}</h3>}
        {typeof message === 'string' ? <p>{message}</p> : message}
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
