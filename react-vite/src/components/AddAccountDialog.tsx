import { useEffect, useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { detectCurrentAuthEmail } from '@/lib/api'
import { validateAccountName, cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
}

export default function AddAccountDialog({ open, onClose }: Props) {
  const addAccount = useAppStore((s) => s.addAccount)
  const accounts = useAppStore((s) => s.accounts)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [showOverwrite, setShowOverwrite] = useState(false)

  useEffect(() => {
    if (!open || name) return

    let cancelled = false
    detectCurrentAuthEmail()
      .then((email) => {
        if (!cancelled && email) setName(email)
      })
      .catch(() => {
        // Email is a convenience default; manual input remains the fallback.
      })

    return () => {
      cancelled = true
    }
  }, [open, name])

  if (!open) return null

  const handleAdd = async () => {
    const err = validateAccountName(name)
    if (err) { setError(err); return }

    const exists = accounts.some((a) => a.name === name)
    if (exists && !showOverwrite) {
      setShowOverwrite(true)
      return
    }

    try {
      await addAccount(name, note || undefined, exists)
      handleClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '添加失败')
    }
  }

  const handleClose = () => {
    setName('')
    setNote('')
    setError(null)
    setOverwrite(false)
    setShowOverwrite(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-component="AddAccountDialog">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative w-[400px] max-w-[90vw] bg-bg-surface border border-line rounded-lg card-ring">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="text-sm font-semibold text-fg font-serif">添加当前 Codex 账号</h3>
          <button onClick={handleClose} className="w-6 h-6 flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-hover">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {showOverwrite ? (
            <div className="flex items-start gap-2 p-3 rounded-md bg-warning-muted border border-warning/20">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-warning font-medium">
                  账号「{name}」已存在，是否覆盖？
                </p>
                <p className="text-xs text-fg-muted mt-1">
                  覆盖前会自动备份旧账号。
                </p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-fg-muted mb-1">账号别名</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(null) }}
                  placeholder="例如 zhangsan@gmail.com"
                  className="w-full px-2.5 py-1.5 rounded-md text-xs bg-bg border border-line text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none"
                  autoFocus
                />
                {error && <p className="text-xs text-danger mt-1">{error}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-fg-muted mb-1">备注（可选）</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="例如：主账号、工作账号"
                  className="w-full px-2.5 py-1.5 rounded-md text-xs bg-bg border border-line text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-line">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-fg-muted bg-bg-elevated hover:bg-bg-hover transition-colors"
          >
            取消
          </button>
          {showOverwrite ? (
            <button
              onClick={handleAdd}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-warning hover:bg-warning/80 transition-colors"
            >
              确认覆盖
            </button>
          ) : (
            <button
              onClick={handleAdd}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-primary hover:bg-primary-hover transition-colors"
            >
              添加
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
