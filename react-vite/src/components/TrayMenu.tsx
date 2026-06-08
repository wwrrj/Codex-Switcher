import { ExternalLink, LogOut, RefreshCw, Sparkles, RadioTower, Smartphone } from 'lucide-react'
import { emit } from '@tauri-apps/api/event'
import { useLayoutEffect } from 'react'
import { useAppStore } from '@/store/appStore'
import * as api from '@/lib/api'
import { cn, shortName } from '@/lib/utils'

export default function TrayMenu() {
  const init = useAppStore((state) => state.init)
  const accounts = useAppStore((state) => state.accounts)
  const activeAccount = useAppStore((state) => state.activeAccount)
  const switchingAccount = useAppStore((state) => state.switchingAccount)
  const switchToAccount = useAppStore((state) => state.switchToAccount)
  const proxyState = useAppStore((state) => state.proxyState)
  const refreshProxyState = useAppStore((state) => state.refreshProxyState)

  useLayoutEffect(() => {
    document.documentElement.classList.add('tray-window')
    void init()
    return () => document.documentElement.classList.remove('tray-window')
  }, [init])

  useLayoutEffect(() => {
    const refresh = () => void refreshProxyState(true)
    refresh()
    const timer = window.setInterval(refresh, 5_000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [refreshProxyState])

  const openMain = async () => {
    await api.showMainWindow()
    await api.hideTrayMenu()
  }

  const refreshUsage = async () => {
    await emit('tray-refresh-usage')
    await api.hideTrayMenu()
  }

  const switchAccount = async (name: string) => {
    if (name === activeAccount || switchingAccount) return
    await switchToAccount(name)
    await emit('tray-account-switched', { name, success: true })
    await api.hideTrayMenu()
  }

  return (
    <div data-component="TrayMenu" className="h-screen bg-transparent text-fg">
      <section className="h-full rounded-2xl border border-line bg-bg-surface card-ring overflow-hidden flex flex-col">
        <div className="px-3 py-2.5 border-b border-line-subtle bg-bg-elevated/60 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg border border-primary/25 bg-primary-muted flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-fg font-serif leading-tight">Codex Switcher</p>
            <p className="text-[10px] text-fg-subtle">快速切换账号</p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <IconButton title="打开主窗口" onClick={openMain}>
              <ExternalLink className="w-3.5 h-3.5" />
            </IconButton>
            <IconButton title="刷新用量" onClick={refreshUsage}>
              <RefreshCw className="w-3.5 h-3.5" />
            </IconButton>
            <IconButton title="退出程序" danger onClick={() => void api.quitApp()}>
              <LogOut className="w-3.5 h-3.5" />
            </IconButton>
          </div>
        </div>

        <div className="px-3 py-2 border-b border-line-subtle grid grid-cols-2 gap-2 text-[10px]">
          <div className="rounded-md bg-bg-elevated/60 border border-line-subtle px-2 py-1.5 min-w-0">
            <p className="text-fg-subtle flex items-center gap-1">
              <RadioTower className="w-3 h-3" />
              请求出口
            </p>
            <p className="text-fg truncate mt-0.5" title={proxyState.requestProvider?.name ?? activeAccount ?? '—'}>
              {shortName(proxyState.requestProvider?.name ?? activeAccount ?? '—', 16)}
            </p>
          </div>
          <div className="rounded-md bg-bg-elevated/60 border border-line-subtle px-2 py-1.5 min-w-0">
            <p className="text-fg-subtle flex items-center gap-1">
              <Smartphone className="w-3 h-3" />
              移动端驻留
            </p>
            <p className="text-fg truncate mt-0.5" title={proxyState.mobileResidency.accountName ?? '未启用'}>
              {proxyState.mobileResidency.enabled ? shortName(proxyState.mobileResidency.accountName ?? '未选择', 16) : '未启用'}
            </p>
          </div>
        </div>

        <div className="px-3 py-2 border-b border-line-subtle text-[10px]">
          <div className="rounded-md bg-bg-elevated/60 border border-line-subtle px-2 py-1.5 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', proxyState.status === 'running' ? 'bg-success' : 'bg-fg-subtle/40')} />
              <span className="text-fg-subtle">代理</span>
              <span className="text-fg truncate min-w-0">
                {proxyState.status === 'running' ? '运行中' : proxyState.config.enabled ? '待恢复' : '未启用'}
              </span>
              {proxyState.recentRequests[0] && (
                <span className="ml-auto text-fg-subtle shrink-0">
                  {proxyState.recentRequests[0].durationMs}ms
                </span>
              )}
            </div>
            {proxyState.recentRequests[0] && (
              <p className="text-fg-subtle mt-0.5 truncate" title={`${proxyState.recentRequests[0].method} ${proxyState.recentRequests[0].path}`}>
                {proxyState.recentRequests[0].method} · {proxyState.recentRequests[0].path}
              </p>
            )}
          </div>
        </div>

        <div className="tray-scroll flex-1 overflow-y-auto p-2 space-y-1">
          {accounts.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-fg-subtle">还没有保存账号</p>
          ) : (
            accounts.map((account) => {
              const active = account.name === activeAccount
              const usageWindow = account.usage?.windows.find((window) => window.window === '5h') ?? account.usage?.windows[0]
              const usage = usageWindow?.percentage
              const remaining = usage == null ? null : Math.max(0, Math.round(100 - usage))
              return (
                <button
                  key={account.name}
                  onClick={() => void switchAccount(account.name)}
                  disabled={active || switchingAccount !== null}
                  className={cn(
                    'w-full h-10 rounded-lg px-2.5 text-left border transition-colors flex items-center gap-2',
                    active
                      ? 'border-primary/30 bg-primary-muted'
                      : 'border-transparent hover:border-line hover:bg-bg-hover',
                    switchingAccount && !active && 'opacity-50'
                  )}
                >
                  <span className={cn('w-2 h-2 rounded-full shrink-0', active ? 'bg-success' : 'bg-fg-subtle/40')} />
                  <span className="text-xs font-medium text-fg truncate min-w-0 flex-1" title={account.name}>
                    {shortName(account.name, 20)}
                  </span>
                  <span className="text-[10px] text-fg-subtle shrink-0">
                    {account.subscription?.displayName ?? 'Unknown'}
                  </span>
                  <span
                    className={cn(
                      'w-14 text-right text-[10px] font-medium tabular-nums shrink-0',
                      remaining == null ? 'text-fg-subtle' : remaining <= 10 ? 'text-danger' : remaining <= 30 ? 'text-warning' : 'text-success'
                    )}
                  >
                    {remaining == null ? '未查询' : `${remaining}%`}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}

function IconButton({ children, title, danger, onClick }: {
  children: React.ReactNode
  title: string
  danger?: boolean
  onClick: () => void | Promise<void>
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={() => void onClick()}
      className={cn(
        'w-7 h-7 flex items-center justify-center rounded-md transition-colors',
        danger
          ? 'text-danger hover:bg-danger-muted'
          : 'text-fg-muted hover:text-fg hover:bg-bg-hover'
      )}
    >
      {children}
    </button>
  )
}
