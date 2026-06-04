import { useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { validateAccountName } from '@/lib/utils'

interface Props {
  open: boolean
  currentName: string
  onClose: () => void
}

export default function RenameAccountDialog({ open, currentName, onClose }: Props) {
  const renameAccount = useAppStore((s) => s.renameAccount)
  const [newName, setNewName] = useState(currentName)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)

  if (!open) return null

  const handleRename = async () => {
    if (newName === currentName) { handleClose(); return }
    const err = validateAccountName(newName)
    if (err) { setError(err); return }
    try {
      setRenaming(true)
      await renameAccount(currentName, newName)
      handleClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '重命名失败')
    } finally {
      setRenaming(false)
    }
  }

  const handleClose = () => {
    setNewName(currentName)
    setError(null)
    setRenaming(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-component="RenameAccountDialog">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative w-[380px] max-w-[90vw] bg-bg-surface border border-line rounded-lg card-ring">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="text-sm font-semibold text-fg font-serif">重命名账号</h3>
          <button onClick={handleClose} className="w-6 h-6 flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-hover">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4">
          <label className="block text-xs font-medium text-fg-muted mb-1">新别名</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setError(null) }}
            className="w-full px-2.5 py-1.5 rounded-md text-xs bg-bg border border-line text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none"
            autoFocus
          />
          {error && <p className="text-xs text-danger mt-1">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-line">
          <button
            onClick={handleClose}
            disabled={renaming}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-fg-muted bg-bg-elevated hover:bg-bg-hover transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleRename}
            disabled={renaming}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-primary hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {renaming ? '重命名中...' : '确认'}
          </button>
        </div>
      </div>
    </div>
  )
}