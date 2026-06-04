import { RefreshCw, ArrowRightLeft, Pencil, Trash2, ExternalLink, AlertTriangle, Key, CheckCircle2, Calendar, Clock, Users, Activity, Settings, Star, Plus } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import UsageWindowCard from './UsageWindowCard'
import RefreshAllProgress from './RefreshAllProgress'
import SubscriptionBadge from './SubscriptionBadge'
import AccountPool from './AccountPool'
import UsageHeatmap from './UsageHeatmap'
import TokenUsageCard from './TokenUsageCard'
import { cn, formatDate, shortName } from '@/lib/utils'

interface Props {
  onRename?: () => void
  onDelete?: () => void
  onAddAccount?: () => void
  onOpenSettings?: () => void
}

export default function MainArea({ onRename, onDelete, onAddAccount, onOpenSettings }: Props) {
  const activeAccount = useAppStore((s) => s.activeAccount)
  const accounts = useAppStore((s) => s.accounts)
  const isRefreshingAuth = useAppStore((s) => s.isRefreshingAuth)
  const isRefreshingAll = useAppStore((s) => s.isRefreshingAll)
  const refreshingUsageAccount = useAppStore((s) => s.refreshingUsageAccount)
  const isRefreshingTokenUsage = useAppStore((s) => s.isRefreshingTokenUsage)
  const switchingAccount = useAppStore((s) => s.switchingAccount)
  const usageHistory = useAppStore((s) => s.usageHistory)
  const tokenUsage = useAppStore((s) => s.tokenUsage)
  const refreshUsage = useAppStore((s) => s.refreshUsage)
  const refreshAllUsage = useAppStore((s) => s.refreshAllUsage)
  const refreshTokenUsage = useAppStore((s) => s.refreshTokenUsage)
  const switchToAccount = useAppStore((s) => s.switchToAccount)
  const openSubDialog = useAppStore((s) => s.openSubscriptionOverrideDialog)
  const refreshAuth = useAppStore((s) => s.refreshAuth)

  const account = accounts.find((a) => a.name === activeAccount) ?? null
  const hasAccount = account !== null

  // Derive values safely — account may be null
  const usage = account?.usage ?? null
  const isUnsupported = usage?.rawSource === 'unsupported'
  const isApiKey = account?.subscription?.plan === 'api_key'
  const windows5h = usage?.windows.find((w) => w.window === '5h') ?? null
  const windows7d = usage?.windows.find((w) => w.window === '7d') ?? null
  const isRefreshingCurrent = refreshingUsageAccount === account?.name

  // Pool-level stats
  const totalAccounts = accounts.length
  const poolUsage5h = accounts.reduce((sum, a) => {
    const w = a.usage?.windows.find((w) => w.window === '5h')
    return sum + (w?.percentage ?? 0)
  }, 0)
  const avgUsage5h = totalAccounts > 0 ? Math.round(poolUsage5h / totalAccounts) : 0
  const priorityCount = accounts.filter((a) => a.priority).length

  // Auto-switch recommendation — prefer priority accounts
  const priorityAccounts = accounts.filter((a) => !a.isActive && a.priority)
  const candidates = priorityAccounts.length > 0 ? priorityAccounts : accounts.filter((a) => !a.isActive)
  const autoTarget = candidates.find((a) => {
    const u = a.usage?.windows.find((w) => w.window === '5h')
    return !u || (u.percentage != null && u.percentage < 90)
  }) ?? candidates[0]

  return (
    <main data-component="MainArea" className="flex-1 overflow-y-auto min-w-0">
      <div className="p-6 max-w-[920px] mx-auto space-y-5">

      {!hasAccount ? (
        /* ── Empty state ── */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertTriangle className="w-8 h-8 text-fg-subtle mb-3" strokeWidth={1.5} />
          <p className="text-sm text-fg-muted">没有可用的账号</p>
          <p className="text-xs text-fg-subtle mt-1 mb-4">请先添加一个 Codex 账号</p>
          {onAddAccount && (
            <button
              onClick={onAddAccount}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium text-white bg-primary hover:bg-primary-hover transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              添加账号
            </button>
          )}
        </div>
      ) : (
        <>
        {/* ── Toolbar: Refresh + Settings ── */}
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={refreshAuth}
            disabled={isRefreshingAuth}
            title="刷新状态"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-fg-muted hover:text-fg hover:bg-bg-hover transition-colors"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isRefreshingAuth && 'animate-spin')} />
            {isRefreshingAuth ? '刷新中' : '刷新状态'}
          </button>
          <button
            onClick={onOpenSettings}
            title="设置"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-fg-muted hover:text-fg hover:bg-bg-hover transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            设置
          </button>
        </div>

        {/* ── Pool Stats Summary ── */}
        <div data-component="PoolStats" className="grid grid-cols-4 gap-3">
          <StatCard
            icon={<Users className="w-3.5 h-3.5" />}
            label="账号总数"
            value={`${totalAccounts}`}
            hint="个账号"
          />
          <StatCard
            icon={<Activity className="w-3.5 h-3.5" />}
            label="平均 5h 用量"
            value={`${avgUsage5h}%`}
            hint="所有账号均值"
            color={avgUsage5h >= 80 ? 'warning' : undefined}
          />
          <StatCard
            icon={<Star className="w-3.5 h-3.5" />}
            label="优先账号"
            value={`${priorityCount}`}
            hint="优先使用方案"
          />
          <StatCard
            icon={<ArrowRightLeft className="w-3.5 h-3.5" />}
            label="推荐切换"
            value={autoTarget ? shortName(autoTarget.name, 12) : '—'}
            hint={autoTarget?.priority ? '优先账号' : '普通账号'}
          />
        </div>

        {isRefreshingAll && <RefreshAllProgress />}

        {/* ── Two-column: Account Info + Usage ── */}
        <div className="grid grid-cols-5 gap-4">

          {/* Left: Account column (2 cols) */}
          <div className="col-span-2 space-y-2.5">
            <h2 className="text-sm font-semibold text-fg font-serif">当前账号</h2>
            <div
              data-component="AccountOverview"
              className="rounded-xl border border-line bg-bg-surface card-ring p-4 space-y-2.5"
            >
              {/* Account header — dot + email inline */}
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'w-2.5 h-2.5 rounded-full shrink-0',
                    account.isActive ? 'bg-success' : 'bg-fg-subtle/40'
                  )}
                />
                <h1 className="text-lg font-semibold text-fg tracking-tight font-serif leading-tight truncate min-w-0" title={account.name}>
                  {account.name}
                </h1>
              </div>

              {/* Badges row */}
              <div className="flex items-center gap-2 flex-wrap">
                {account.isActive && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-success font-medium bg-success-muted px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />
                    激活中
                  </span>
                )}
                {account.priority && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-accent font-medium bg-accent-muted px-2 py-0.5 rounded-full">
                    <Star className="w-3 h-3" />
                    优先
                  </span>
                )}
                {account.subscription && (
                  <SubscriptionBadge plan={account.subscription.plan} displayName={account.subscription.displayName} size="md" />
                )}
                {account.manualSubscriptionOverride && (
                  <button
                    onClick={() => openSubDialog(account.name)}
                    className="text-[10px] text-warning bg-warning-muted px-1.5 py-0.5 rounded-full flex items-center gap-0.5 hover:bg-warning/20 transition-colors"
                  >
                    手动覆盖
                  </button>
                )}
              </div>

              {/* Subscription info */}
              {account.subscription && (
                <div className="rounded-lg bg-bg-elevated/60 border border-line-subtle p-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-fg-subtle">方案</span>
                    <span className="font-medium text-fg">{account.subscription.displayName}</span>
                  </div>
                </div>
              )}

              {/* Account metadata */}
              <div className="rounded-lg bg-bg-elevated/60 border border-line-subtle p-2.5 space-y-1">
                <MetaRow icon={<Calendar className="w-3 h-3" />} label="创建时间" value={formatDate(account.createdAt)} />
                <MetaRow icon={<Clock className="w-3 h-3" />} label="更新时间" value={formatDate(account.updatedAt)} />
                {account.lastUsageCheckAt && (
                  <MetaRow icon={<Activity className="w-3 h-3" />} label="最近查询" value={formatDate(account.lastUsageCheckAt)} />
                )}
              </div>
            </div>
          </div>

          {/* Right: Usage Details (3 cols) */}
          <div className="col-span-3 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-fg font-serif">用量详情</h2>
              <button
                onClick={() => refreshUsage(account.name)}
                disabled={isRefreshingAll || isRefreshingCurrent}
                className="flex items-center gap-1 text-[11px] text-primary hover:text-primary-hover transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('w-3 h-3', isRefreshingCurrent && 'animate-spin')} />
                {isRefreshingCurrent ? '刷新中' : '刷新当前'}
              </button>
            </div>

            {isApiKey ? (
              <div className="rounded-xl border border-warning/30 bg-warning-muted p-4 card-ring">
                <div className="flex items-start gap-2.5">
                  <Key className="w-4 h-4 text-warning shrink-0 mt-0.5" strokeWidth={2} />
                  <div>
                    <p className="text-sm font-medium text-warning">API Key 账号</p>
                    <p className="text-xs text-fg-muted mt-1 leading-relaxed">
                      API Key 使用 OpenAI Platform 计费，本工具暂不支持自动查询 API Key 用量。
                    </p>
                    <button
                      onClick={() => refreshUsage(account.name)}
                      className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-primary bg-primary-muted hover:bg-primary/15 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      打开 OpenAI Platform
                    </button>
                  </div>
                </div>
              </div>
            ) : isUnsupported ? (
              <div className="rounded-xl border border-warning/30 bg-warning-muted p-4 card-ring">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" strokeWidth={2} />
                  <div>
                    <p className="text-sm font-medium text-warning">用量查询不可用</p>
                    <p className="text-xs text-fg-muted mt-1 leading-relaxed">
                      当前 Codex 版本暂不支持自动查询用量。
                    </p>
                    <button
                      onClick={() => refreshUsage(account.name)}
                      className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-primary bg-primary-muted hover:bg-primary/15 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      打开 Codex Usage 页面
                    </button>
                  </div>
                </div>
              </div>
            ) : !usage ? (
              <div className="rounded-xl border border-line bg-bg-surface p-6 text-center card-ring">
                <p className="text-sm text-fg-muted mb-3">还没有查询用量</p>
                <button
                  onClick={() => refreshUsage(account.name)}
                  disabled={isRefreshingCurrent}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-primary bg-primary-muted hover:bg-primary/15 transition-colors"
                >
                  <RefreshCw className={cn('w-3 h-3', isRefreshingCurrent && 'animate-spin')} />
                  {isRefreshingCurrent ? '查询中' : '立即查询'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <UsageWindowCard windowData={windows5h} label="5 小时窗口" />
                <UsageWindowCard windowData={windows7d} label="7 天窗口" />
              </div>
            )}
          </div>
        </div>

        <UsageHeatmap history={usageHistory} tokenDays={tokenUsage?.days ?? []} />

        <TokenUsageCard summary={tokenUsage} onRefresh={refreshTokenUsage} isRefreshing={isRefreshingTokenUsage} />

        {/* ── Quick actions ── */}
        <div className="flex items-center gap-2 pt-1">
          {!account.isActive && (
            <button
              onClick={() => switchToAccount(account.name)}
              disabled={isRefreshingAll || switchingAccount !== null}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium text-white bg-primary hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {switchingAccount === account.name ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowRightLeft className="w-3.5 h-3.5" />
              )}
              {switchingAccount === account.name ? '正在关闭 Codex' : '切换到此账号'}
            </button>
          )}
          <button
            onClick={() => refreshAllUsage()}
            disabled={isRefreshingAll}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors',
              'text-primary bg-primary-muted hover:bg-primary/15',
              isRefreshingAll && 'opacity-50 cursor-not-allowed'
            )}
          >
            <RefreshCw className={cn('w-3 h-3', isRefreshingAll && 'animate-spin')} />
            刷新全部
          </button>
          <button
            onClick={onRename}
            disabled={isRefreshingAll}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium text-fg-muted bg-bg-elevated hover:bg-bg-hover transition-colors disabled:opacity-50"
          >
            <Pencil className="w-3 h-3" />
            重命名
          </button>
          <button
            onClick={onDelete}
            disabled={isRefreshingAll}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium text-danger hover:bg-danger-muted transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3 h-3" />
            删除
          </button>
        </div>
        </>
      )}

      {/* ── Account pool (always visible) ── */}
      {onAddAccount && <AccountPool onAddAccount={onAddAccount} />}
      </div>
    </main>
  )
}

/* ── Helper sub-components ── */

function StatCard({ icon, label, value, hint, color }: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
  color?: 'warning'
}) {
  return (
    <div className="rounded-lg border border-line bg-bg-surface card-ring px-3.5 py-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={cn('text-fg-subtle', color === 'warning' && 'text-warning')}>{icon}</span>
        <span className="text-[11px] text-fg-subtle">{label}</span>
      </div>
      <div className={cn('text-lg font-semibold text-fg font-serif tabular-nums leading-tight', color === 'warning' && 'text-warning')}>
        {value}
      </div>
      <p className="text-[10px] text-fg-subtle mt-0.5">{hint}</p>
    </div>
  )
}

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-fg-subtle flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="text-fg">{value}</span>
    </div>
  )
}
