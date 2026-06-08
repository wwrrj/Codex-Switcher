import { RefreshCw, ArrowRightLeft, Pencil, Trash2, ExternalLink, AlertTriangle, Key, CheckCircle2, Calendar, Clock, Users, Activity, Star, Plus, ShieldCheck, ShieldAlert, History, Smartphone, RadioTower } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { getSmartSwitchRecommendation } from '@/lib/api'
import UsageWindowCard from './UsageWindowCard'
import RefreshAllProgress from './RefreshAllProgress'
import SubscriptionBadge from './SubscriptionBadge'
import AccountPool from './AccountPool'
import { cn, formatDate, shortName } from '@/lib/utils'

interface Props {
  onRename?: () => void
  onDelete?: () => void
  onAddAccount?: () => void
}

export default function MainArea({ onRename, onDelete, onAddAccount }: Props) {
  const activeAccount = useAppStore((s) => s.activeAccount)
  const accounts = useAppStore((s) => s.accounts)
  const isRefreshingAuth = useAppStore((s) => s.isRefreshingAuth)
  const isRefreshingAll = useAppStore((s) => s.isRefreshingAll)
  const refreshingUsageAccount = useAppStore((s) => s.refreshingUsageAccount)
  const switchingAccount = useAppStore((s) => s.switchingAccount)
  const refreshUsage = useAppStore((s) => s.refreshUsage)
  const refreshAllUsage = useAppStore((s) => s.refreshAllUsage)
  const switchToAccount = useAppStore((s) => s.switchToAccount)
  const openSubDialog = useAppStore((s) => s.openSubscriptionOverrideDialog)
  const refreshAuth = useAppStore((s) => s.refreshAuth)
  const switchHistory = useAppStore((s) => s.switchHistory)
  const proxyState = useAppStore((s) => s.proxyState)
  const restoreMobileResidency = useAppStore((s) => s.restoreMobileResidency)
  const setRequestProvider = useAppStore((s) => s.setRequestProvider)

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

  const recommendation = getSmartSwitchRecommendation(accounts)
  const autoTarget = recommendation?.account ?? null
  const health = account?.health ?? 'invalid'
  const healthHealthy = health === 'healthy'
  const residency = proxyState.mobileResidency
  const requestName = proxyState.requestProvider?.name ?? activeAccount ?? '—'
  const diskName = residency.diskAccount ?? activeAccount ?? '—'
  const requestProvider = proxyState.requestProvider
  const routePoolCount = proxyState.providers.filter((provider) => provider.enabled && provider.includeInFailover).length

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
        {/* ── Page header ── */}
        <div className="flex items-start justify-between gap-4 pb-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-primary font-medium">Accounts</p>
            <h1 className="text-2xl font-semibold text-fg font-serif mt-1">账号管理</h1>
            <p className="text-xs text-fg-subtle mt-1">管理 Codex 登录账号、切换状态与订阅用量。</p>
          </div>
          <button
            onClick={refreshAuth}
            disabled={isRefreshingAuth}
            title="刷新状态"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-fg-muted hover:text-fg hover:bg-bg-hover transition-colors"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isRefreshingAuth && 'animate-spin')} />
            {isRefreshingAuth ? '刷新中' : '刷新状态'}
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

        <div className={cn(
          'rounded-xl border bg-bg-surface card-ring p-4',
          residency.enabled && !residency.healthy ? 'border-warning/40 bg-warning-muted/40' : 'border-line'
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-primary-muted text-primary flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-semibold text-fg font-serif">移动端驻留</h2>
                  <span className={cn(
                    'text-[10px] rounded-full px-2 py-0.5',
                    proxyState.status === 'running' ? 'text-success bg-success-muted' : 'text-fg-muted bg-bg-elevated'
                  )}>
                    代理：{proxyState.status === 'running' ? '运行中' : '未运行'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
                  <ResidencyMetric label="移动端驻留" value={residency.enabled ? residency.accountName ?? '未选择' : '未启用'} />
                  <ResidencyMetric label="磁盘账号" value={diskName} />
                  <ResidencyMetric label="请求出口" value={requestName} />
                </div>
                {residency.enabled && residency.accountName && requestName !== residency.accountName && (
                  <p className="text-[11px] text-primary mt-2">
                    移动端驻留已启用：手机远程连接保持在 {residency.accountName}，请求出口当前为 {requestName}。
                  </p>
                )}
                {residency.warnings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {residency.warnings.map((warning) => (
                      <p key={warning} className="text-[11px] text-warning">{warning}</p>
                    ))}
                  </div>
                )}
                {proxyState.warnings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {proxyState.warnings.map((warning) => (
                      <p key={warning} className="text-[11px] text-warning">{warning}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {residency.enabled && !residency.healthy && (
                <button
                  onClick={() => void restoreMobileResidency()}
                  className="px-2.5 py-1.5 rounded-md text-[11px] font-medium text-warning bg-warning-muted hover:bg-warning/20"
                >
                  恢复驻留
                </button>
              )}
              {proxyState.config.enabled && account && (
                <button
                  onClick={() => void setRequestProvider(`account:${account.name}`)}
                  className="px-2.5 py-1.5 rounded-md text-[11px] font-medium text-primary bg-primary-muted hover:bg-primary/15"
                >
                  <RadioTower className="inline w-3 h-3 mr-1" />
                  设为请求出口
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-2 rounded-xl border border-line bg-bg-surface card-ring p-4">
            <div className="flex items-center gap-2 mb-3">
              <RadioTower className="w-3.5 h-3.5 text-primary" />
              <h2 className="text-sm font-semibold text-fg font-serif">代理状态</h2>
            </div>
            <div className="space-y-2">
              <ProxyMetric
                label="运行状态"
                value={proxyState.status === 'running' ? proxyState.listenUrl ?? '运行中' : '未运行'}
                tone={proxyState.status === 'running' ? 'success' : proxyState.config.enabled ? 'warning' : undefined}
              />
              <ProxyMetric
                label="Codex 接管"
                value={proxyState.codexConfig.installed ? '已接管' : '未接管'}
                tone={proxyState.codexConfig.installed ? 'success' : proxyState.config.installCodexConfig ? 'warning' : undefined}
              />
              <ProxyMetric
                label="自动故障转移"
                value={proxyState.config.routing.automaticFailover ? `已启用 · ${routePoolCount} 个出口` : '未启用'}
                tone={proxyState.config.routing.automaticFailover ? 'success' : undefined}
              />
              <ProxyMetric
                label="当前出口"
                value={requestProvider ? `${requestProvider.name} · ${providerHealthText(requestProvider.health.status)}` : requestName}
                tone={requestProvider?.health.status === 'cooling_down' || requestProvider?.health.status === 'invalid' ? 'warning' : undefined}
              />
            </div>
          </div>

          <div className="col-span-3 rounded-xl border border-line bg-bg-surface card-ring p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <History className="w-3.5 h-3.5 text-fg-muted" />
                <h2 className="text-sm font-semibold text-fg font-serif">最近故障转移</h2>
              </div>
              <span className="text-[10px] text-fg-subtle">
                最多保留 50 条
              </span>
            </div>
            {proxyState.recentFailovers.length > 0 ? (
              <div className="space-y-2">
                {proxyState.recentFailovers.slice(0, 3).map((event) => (
                  <div key={event.id} className="rounded-lg bg-bg-elevated/60 border border-line-subtle px-3 py-2">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
                      <span className="text-fg truncate min-w-0">
                        {event.fromProvider} → {event.toProvider ?? '无可用出口'}
                      </span>
                      <span className="text-fg-subtle ml-auto shrink-0">{formatDate(event.time)}</span>
                    </div>
                    <p className="text-[10px] text-fg-subtle mt-1 truncate" title={event.reason}>
                      {event.statusCode ? `${event.statusCode} · ` : ''}{event.reason}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-fg-subtle">
                暂无故障转移记录。只有代理请求遇到配额、限速、鉴权或容量问题时才会记录。
              </p>
            )}
          </div>
        </div>

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

              <div className={cn(
                'rounded-lg border p-2.5',
                healthHealthy ? 'border-success/20 bg-success-muted' : 'border-warning/30 bg-warning-muted'
              )}>
                <div className="flex items-start gap-2">
                  {healthHealthy
                    ? <ShieldCheck className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                    : <ShieldAlert className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />}
                  <div>
                    <p className={cn('text-[11px] font-medium', healthHealthy ? 'text-success' : 'text-warning')}>
                      {healthHealthy ? '账号状态正常' : health === 'expiring_soon' ? '认证即将过期' : health === 'expired' ? '认证已过期' : '认证文件异常'}
                    </p>
                    <p className="text-[10px] text-fg-subtle mt-0.5">
                      {account.healthMessage ?? '认证文件有效，可以正常查询与切换'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-bg-elevated/60 border border-line-subtle p-2.5 space-y-1.5">
                <p className="text-[11px] font-medium text-fg-muted mb-1">Token 过期时间</p>
                {account.authTokens.filter((token) => token.kind === 'access_token').map((token) => (
                  <MetaRow
                    key={token.kind}
                    icon={<Key className="w-3 h-3" />}
                    label={tokenLabel(token.kind)}
                    value={tokenExpiryText(token.kind, token)}
                  />
                ))}
              </div>

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

        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-2 rounded-xl border border-line bg-bg-surface card-ring p-4">
            <div className="flex items-center gap-2 mb-3">
              <ArrowRightLeft className="w-3.5 h-3.5 text-primary" />
              <h2 className="text-sm font-semibold text-fg font-serif">智能切换推荐</h2>
            </div>
            {recommendation ? (
              <>
                <p className="text-sm font-medium text-fg truncate" title={recommendation.account.name}>{recommendation.account.name}</p>
                <p className="text-[11px] text-fg-subtle mt-1">{recommendation.reason}</p>
                <button
                  onClick={() => switchToAccount(recommendation.account.name)}
                  disabled={switchingAccount !== null || isRefreshingAll}
                  className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-white bg-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  <ArrowRightLeft className="w-3 h-3" />
                  切换到推荐账号
                </button>
              </>
            ) : (
              <p className="text-[11px] text-fg-subtle">没有其他健康账号可供推荐。</p>
            )}
          </div>
          <div className="col-span-3 rounded-xl border border-line bg-bg-surface card-ring p-4">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-3.5 h-3.5 text-fg-muted" />
              <h2 className="text-sm font-semibold text-fg font-serif">最近切换</h2>
            </div>
            {switchHistory.length > 0 ? (
              <div className="space-y-2">
                {switchHistory.slice(0, 3).map((entry) => (
                  <div key={entry.id} className="flex items-center gap-2 text-[11px]">
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', entry.success ? 'bg-success' : 'bg-danger')} />
                    <span className="text-fg-muted truncate min-w-0">{entry.fromAccount ?? '未知账号'} → {entry.toAccount}</span>
                    <span className="text-fg-subtle ml-auto shrink-0">{formatDate(entry.switchedAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-fg-subtle">还没有账号切换记录。</p>
            )}
          </div>
        </div>

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

function ResidencyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg-elevated/60 border border-line-subtle px-2.5 py-2 min-w-0">
      <p className="text-[10px] text-fg-subtle">{label}</p>
      <p className="text-[11px] text-fg font-medium truncate mt-0.5" title={value}>{value}</p>
    </div>
  )
}

function ProxyMetric({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-bg-elevated/60 border border-line-subtle px-2.5 py-2">
      <span className="text-[10px] text-fg-subtle shrink-0">{label}</span>
      <span
        className={cn(
          'text-[11px] font-medium truncate text-right',
          tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-fg'
        )}
        title={value}
      >
        {value}
      </span>
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

function tokenLabel(kind: string): string {
  if (kind === 'access_token') return 'Access'
  return kind
}

function providerHealthText(status: string): string {
  if (status === 'healthy') return '正常'
  if (status === 'cooling_down') return '冷却中'
  if (status === 'disabled') return '已停用'
  if (status === 'invalid') return '异常'
  return '待验证'
}

function tokenExpiryText(kind: string, token: { present: boolean; expiresAt?: string; status: string }): string {
  if (!token.present) return '未保存'
  if (!token.expiresAt) return '无 exp'
  const suffix = token.status === 'expired'
    ? '已过期'
    : token.status === 'expiring_soon'
      ? '即将过期'
      : '有效'
  return `${formatDate(token.expiresAt)} · ${suffix}`
}
