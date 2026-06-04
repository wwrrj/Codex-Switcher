import { useState, useRef, useEffect } from 'react'
import { Plus, Users, Star, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { cn, shortName } from '@/lib/utils'
import SubscriptionBadge from './SubscriptionBadge'

interface Props {
  onAddAccount: () => void
}

export default function AccountPool({ onAddAccount }: Props) {
  const accounts = useAppStore((s) => s.accounts)
  const activeAccount = useAppStore((s) => s.activeAccount)
  const switchToAccount = useAppStore((s) => s.switchToAccount)
  const isRefreshingAll = useAppStore((s) => s.isRefreshingAll)
  const switchingAccount = useAppStore((s) => s.switchingAccount)
  const togglePriority = useAppStore((s) => s.togglePriority)
  const loading = useAppStore((s) => s.loading)

  const [confirmTarget, setConfirmTarget] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Sort: priority accounts first, then by name
  const sorted = [...accounts].sort((a, b) => {
    if (a.priority && !b.priority) return -1
    if (!a.priority && b.priority) return 1
    return a.name.localeCompare(b.name)
  })

  // Non-passive wheel listener to block vertical scroll, only allow horizontal
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      // Block vertical scroll entirely
      e.preventDefault()
      // Only scroll horizontally
      el.scrollLeft += e.deltaY || e.deltaX
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [loading])

  const handleCardClick = (name: string) => {
    if (name === activeAccount || isRefreshingAll || switchingAccount) return
    setConfirmTarget(name)
  }

  const handleConfirmSwitch = async () => {
    if (confirmTarget) {
      await switchToAccount(confirmTarget)
      setConfirmTarget(null)
    }
  }

  // Right-click toggles priority (deferred to avoid event conflicts)
  const handleContextMenu = (name: string, e: React.MouseEvent) => {
    e.preventDefault()
    setTimeout(() => togglePriority(name), 0)
  }

  if (loading) return null

  return (
    <div
      data-component="AccountPool"
      className="bg-bg-surface border border-line rounded-xl card-ring"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2.5">
        <Users className="w-4 h-4 text-fg-muted shrink-0" strokeWidth={2} />
        <span className="text-sm font-semibold text-fg font-serif">账号池</span>
        <span className="text-xs text-fg-muted bg-bg-elevated px-1.5 py-0.5 rounded-full">{accounts.length} 个账号</span>
        <span className="text-[11px] text-fg-subtle ml-auto">点击切换 · 右键设优先</span>
        <button
          onClick={onAddAccount}
          disabled={isRefreshingAll}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-primary bg-primary-muted hover:bg-primary/15 transition-colors disabled:opacity-50 shrink-0"
        >
          <Plus className="w-3 h-3" />
          添加账号
        </button>
      </div>

      {/* Card grid — horizontal scroll, vertical scroll blocked */}
      <div
        ref={scrollRef}
        className="flex gap-3 px-4 pb-4 overflow-x-auto overflow-y-hidden"
        style={{ overscrollBehavior: 'contain' }}
      >
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center w-full py-8">
            <p className="text-xs text-fg-subtle">还没有账号，点击上方添加</p>
          </div>
        ) : (
          sorted.map((acc) => {
            const isActive = acc.name === activeAccount
            const usage5h = acc.usage?.windows.find((w) => w.window === '5h')
            const pct = usage5h?.percentage
            const isConfirming = confirmTarget === acc.name
            const isPriority = !!acc.priority

            return (
              <div key={acc.name} className="relative shrink-0">
                <button
                  onClick={() => handleCardClick(acc.name)}
                  onContextMenu={(e) => handleContextMenu(acc.name, e)}
                  disabled={(isRefreshingAll && !isActive) || switchingAccount !== null}
                  className={cn(
                    'w-[168px] p-3.5 rounded-lg text-left transition-all',
                    'border bg-bg',
                    isActive
                      ? 'border-primary/30 card-ring'
                      : isConfirming
                        ? 'border-primary/50 bg-primary-muted'
                        : 'border-line-subtle hover:border-line hover:bg-bg-hover',
                    ((isRefreshingAll && !isActive) || switchingAccount !== null) && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {/* Status dot + name — center-aligned on same line */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full shrink-0',
                        isActive ? 'bg-success' : 'bg-fg-subtle/40'
                      )}
                    />
                    <span className="text-sm font-medium text-fg truncate min-w-0" title={acc.name}>
                      {shortName(acc.name)}
                    </span>
                    {isActive && (
                      <span className="text-[9px] text-primary font-medium uppercase tracking-wider shrink-0 ml-auto">
                        当前
                      </span>
                    )}
                  </div>

                  {/* Subscription badge */}
                  <div className="flex items-center gap-1.5 mb-2">
                    {acc.subscription ? (
                      <SubscriptionBadge plan={acc.subscription.plan} displayName={acc.subscription.displayName} />
                    ) : (
                      <span className="text-[10px] text-fg-subtle">—</span>
                    )}
                  </div>

                  {/* Usage info */}
                  {acc.subscription?.plan === 'api_key' ? (
                    <span className="text-[11px] text-fg-subtle">Platform 计费</span>
                  ) : pct != null ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-fg-muted">5h 剩余</span>
                        <span
                          className={cn(
                            'text-[11px] font-medium tabular-nums',
                            pct >= 90 ? 'text-danger' : pct >= 70 ? 'text-warning' : 'text-fg'
                          )}
                        >
                          {100 - pct}%
                        </span>
                      </div>
                      <div className="w-full h-1 rounded-full bg-bg-elevated overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warning' : 'bg-primary'
                          )}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-[11px] text-fg-subtle">未查询</span>
                  )}

                  {/* Priority star — top right corner */}
                  {isPriority && (
                    <div className="absolute top-2 right-2">
                      <Star className="w-3 h-3 text-accent fill-accent/60" strokeWidth={2} />
                    </div>
                  )}
                </button>

                {/* Inline confirm switch */}
                {isConfirming && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-bg/95 backdrop-blur-sm border border-primary/30 z-10">
                    <p className="text-xs text-fg mb-2">切换到 {shortName(acc.name)}？</p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={handleConfirmSwitch}
                        disabled={switchingAccount !== null}
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium text-white bg-primary hover:bg-primary-hover transition-colors"
                      >
                        {switchingAccount === acc.name ? (
                          <span className="flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            正在关闭 Codex
                          </span>
                        ) : '确认'}
                      </button>
                      <button
                        onClick={() => setConfirmTarget(null)}
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium text-fg-muted bg-bg-elevated hover:bg-bg-hover transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
