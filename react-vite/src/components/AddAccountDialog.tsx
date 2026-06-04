import { useEffect, useState } from 'react'
import { X, AlertTriangle, LogOut, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { detectCodexAuth, detectCurrentAuthEmail, prepareNewAccountLogin } from '@/lib/api'
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
  const [showOverwrite, setShowOverwrite] = useState(false)
  const [stage, setStage] = useState<'checking' | 'needs-login' | 'waiting' | 'ready'>('checking')
  const [statusText, setStatusText] = useState('正在检测当前 Codex 登录状态...')
  const [previousAccount, setPreviousAccount] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setStage('checking')
    setStatusText('正在检测当前 Codex 登录状态...')

    detectCodexAuth()
      .then(async (status) => {
        if (cancelled) return
        if (status.matchedAccount) {
          setPreviousAccount(status.matchedAccount)
          setStatusText(`当前 auth.json 已属于账号池内账号「${status.matchedAccount}」。添加新账号前需要先退出当前 Codex 登录。`)
          setStage('needs-login')
          return
        }

        if (!status.exists) {
          setPreviousAccount(null)
          setStatusText('当前 auth.json 不存在。请打开 Codex 并登录新账号。')
          setStage('needs-login')
          return
        }

        const email = await detectCurrentAuthEmail()
        if (cancelled) return
        if (email) setName(email)
        setStatusText(email ? `已解析新账号邮箱：${email}` : '已检测到新的 auth.json，但没有解析到邮箱，可手动填写账号名。')
        setStage('ready')
      })
      .catch(() => {
        if (!cancelled) {
          setStatusText('检测失败，可手动填写账号名后添加当前 auth.json。')
          setStage('ready')
        }
      })

    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open || stage !== 'waiting') return

    let cancelled = false
    const timer = window.setInterval(async () => {
      try {
        const status = await detectCodexAuth()
        if (cancelled) return

        if (!status.exists) {
          setStatusText('等待 Codex 重新生成 auth.json。请在打开的 Codex 登录窗口中完成登录。')
          return
        }

        if (status.matchedAccount) {
          setStatusText(`检测到的 auth.json 仍是账号池内账号「${status.matchedAccount}」，请登录一个新账号。`)
          return
        }

        const email = await detectCurrentAuthEmail()
        if (cancelled) return
        if (email) setName(email)
        setStatusText(email ? `已解析新账号邮箱：${email}` : '已检测到新的 auth.json，但没有解析到邮箱，可手动填写账号名。')
        setStage('ready')
      } catch {
        if (!cancelled) setStatusText('等待 Codex 重新生成 auth.json。')
      }
    }, 2000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open, stage])

  if (!open) return null

  const handleStartLogin = async () => {
    try {
      setError(null)
      setStage('waiting')
      setStatusText(previousAccount ? '正在静默关闭 Codex 并退出当前登录...' : '正在打开 Codex 登录窗口...')
      const result = await prepareNewAccountLogin()
      if (result.previousAccount) setPreviousAccount(result.previousAccount)
      setStatusText(
        result.didLogout
          ? '已退出当前 Codex 登录。请在打开的 Codex 窗口中登录新账号。'
          : '请在 Codex 中登录新账号。'
      )
    } catch (e: unknown) {
      setStage('needs-login')
      setError(e instanceof Error ? e.message : '退出当前登录失败')
    }
  }

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
    setShowOverwrite(false)
    setStage('checking')
    setStatusText('正在检测当前 Codex 登录状态...')
    setPreviousAccount(null)
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
          {stage !== 'ready' && !showOverwrite && (
            <div className={cn(
              'rounded-md border p-3',
              stage === 'needs-login' ? 'bg-warning-muted border-warning/20' : 'bg-bg-elevated border-line-subtle'
            )}>
              <div className="flex items-start gap-2">
                {stage === 'waiting' || stage === 'checking' ? (
                  <RefreshCw className="w-4 h-4 text-primary shrink-0 mt-0.5 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="text-xs font-medium text-fg">
                    {stage === 'needs-login' ? '需要登录新账号' : '等待新 auth.json'}
                  </p>
                  <p className="text-xs text-fg-muted mt-1 leading-relaxed">{statusText}</p>
                  {previousAccount && (
                    <p className="text-[11px] text-fg-subtle mt-1">当前账号：{previousAccount}</p>
                  )}
                </div>
              </div>
              {stage === 'needs-login' && (
                <button
                  onClick={handleStartLogin}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-warning hover:bg-warning/80 transition-colors"
                >
                  <LogOut className="w-3 h-3" />
                  {previousAccount ? '退出并登录新账号' : '打开 Codex 登录'}
                </button>
              )}
            </div>
          )}

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
                <label className="block text-xs font-medium text-fg-muted mb-1">账号邮箱</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(null) }}
                  placeholder="例如 zhangsan@gmail.com"
                  className="w-full px-2.5 py-1.5 rounded-md text-xs bg-bg border border-line text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none"
                  autoFocus
                  disabled={stage !== 'ready'}
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
                  disabled={stage !== 'ready'}
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
              disabled={stage !== 'ready'}
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
