import { ExternalLink, LogOut, RefreshCw, Sparkles, Users } from 'lucide-react'
import { emit } from '@tauri-apps/api/event'
import { useEffect } from 'react'
import { useAppStore } from '@/store/appStore'
import * as api from '@/lib/api'
import { cn, shortName } from '@/lib/utils'
import SubscriptionBadge from './SubscriptionBadge'

export default function TrayMenu() {
  const init = useAppStore((state) => state.init)
  const accounts = useAppStore((state) => state.accounts)
  const activeAccount = useAppStore((state) => state.activeAccount)
  const switchingAccount = useAppStore((state) => state.switchingAccount)
  const switchToAccount = useAppStore((state) => state.switchToAccount)

  useEffect(() => {
    void init()
  }, [init])

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
    <div data-component="TrayMenu" className="h-screen bg-transparent p-2 text-fg">
      <section className="h-full rounded-2xl border border-line bg-bg-surface card-ring shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-line-subtle bg-bg-elevated/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg border border-primary/25 bg-primary-muted flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg font-serif leading-tight">Codex Switcher</p>
              <p className="text-[10px] text-fg-subtle">托盘快捷菜单</p>
            </div>
          </div>
        </div>

        <div className="p-2 space-y-1 border-b border-line-subtle">
          <TrayButton icon={<ExternalLink className="w-3.5 h-3.5" />} label="打开主窗口" onClick={openMain} />
          <TrayButton icon={<RefreshCw className="w-3.5 h-3.5" />} label="刷新所有用量" onClick={refreshUsage} />
        </div>

        <div className="p-2">
          <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] uppercase tracking-[0.16em] text-fg-subtle">
            <Users className="w-3 h-3" />
            Accounts
          </div>
          <div className="max-h-[214px] overflow-y-auto pr-1 space-y-1">
            {accounts.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-fg-subtle">还没有保存账号</p>
            ) : (
              accounts.map((account) => {
                const active = account.name === activeAccount
                const usage = account.usage?.windows.find((window) => window.window === '5h')?.percentage
                const remaining = usage == null ? null : Math.max(0, Math.round(100 - usage))
                return (
                  <button
                    key={account.name}
                    onClick={() => void switchAccount(account.name)}
                    disabled={active || switchingAccount !== null}
                    className={cn(
                      'w-full rounded-lg px-2.5 py-2 text-left border transition-colors',
                      active
                        ? 'border-primary/30 bg-primary-muted'
                        : 'border-transparent hover:border-line hover:bg-bg-hover',
                      switchingAccount && !active && 'opacity-50'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2 h-2 rounded-full shrink-0', active ? 'bg-success' : 'bg-fg-subtle/40')} />
                      <span className="text-xs font-medium text-fg truncate min-w-0" title={account.name}>
                        {shortName(account.name, 22)}
                      </span>
                      {active && <span className="ml-auto text-[9px] text-primary uppercase tracking-wider">当前</span>}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      {account.subscription ? (
                        <SubscriptionBadge plan={account.subscription.plan} displayName={account.subscription.displayName} />
                      ) : (
                        <span className="text-[10px] text-fg-subtle">Unknown</span>
                      )}
                      <span className="text-[10px] text-fg-subtle tabular-nums">
                        {remaining == null ? '未查询' : `5h ${remaining}% 剩余`}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="absolute left-2 right-2 bottom-2 p-2 border-t border-line-subtle bg-bg-surface rounded-b-2xl">
          <TrayButton
            danger
            icon={<LogOut className="w-3.5 h-3.5" />}
            label="退出程序"
            onClick={() => void api.quitApp()}
          />
        </div>
      </section>
    </div>
  )
}

function TrayButton({ icon, label, danger, onClick }: {
  icon: React.ReactNode
  label: string
  danger?: boolean
  onClick: () => void | Promise<void>
}) {
  return (
    <button
      onClick={() => void onClick()}
      className={cn(
        'w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors',
        danger
          ? 'text-danger hover:bg-danger-muted'
          : 'text-fg-muted hover:text-fg hover:bg-bg-hover'
      )}
    >
      {icon}
      {label}
    </button>
  )
}
