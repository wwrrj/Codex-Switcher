import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { useAppStore } from '@/store/appStore'

interface Props {
  targetName: string | null
  isActive: boolean
  onClose: () => void
}

export default function DeleteAccountDialog({ targetName, isActive, onClose }: Props) {
  const deleteAccount = useAppStore((s) => s.deleteAccount)
  const [understood, setUnderstood] = useState(false)

  if (!targetName) return null

  const handleDelete = async () => {
    if (isActive && !understood) return
    await deleteAccount(targetName, isActive)
    setUnderstood(false)
    onClose()
  }

  const handleClose = () => {
    setUnderstood(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-component="DeleteAccountDialog">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative w-[420px] max-w-[90vw] bg-bg-surface border border-line rounded-lg card-ring">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="text-sm font-semibold text-fg font-serif">删除账号</h3>
          <button onClick={handleClose} className="w-6 h-6 flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-hover">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {isActive ? (
            <>
              <div className="flex items-start gap-2.5 p-3 rounded-md bg-danger-muted border border-danger/20">
                <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-danger font-medium">
                    账号「{targetName}」当前正在使用。
                  </p>
                  <p className="text-xs text-fg-muted mt-1">
                    强制删除可能导致状态不一致。确认要删除吗？
                  </p>
                </div>
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                  className="mt-0.5 accent-[hsl(var(--danger))]"
                />
                <span className="text-xs text-fg-muted leading-relaxed">
                  我理解这不会删除 Codex 当前 auth.json，只会删除本工具的账号副本。
                </span>
              </label>
            </>
          ) : (
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-fg">
                  确定删除账号「<span className="font-semibold">{targetName}</span>」吗？
                </p>
                <p className="text-xs text-fg-muted mt-2 leading-relaxed">
                  这只会删除本工具保存的账号副本，不会退出当前 Codex 登录。删除前会自动创建备份。
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-line">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-fg-muted bg-bg-elevated hover:bg-bg-hover transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleDelete}
            disabled={isActive && !understood}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-danger hover:bg-danger-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  )
}
