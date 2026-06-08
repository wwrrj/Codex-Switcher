import { useState } from 'react'
import { History, RadioTower, RefreshCw, Smartphone } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import type { ProxyTestResult } from '@/lib/types'
import { cn, formatDate } from '@/lib/utils'

export default function ProxyRoutingPage() {
  const activeAccount = useAppStore((s) => s.activeAccount)
  const accounts = useAppStore((s) => s.accounts)
  const proxyState = useAppStore((s) => s.proxyState)
  const restoreMobileResidency = useAppStore((s) => s.restoreMobileResidency)
  const enableMobileResidency = useAppStore((s) => s.enableMobileResidency)
  const disableMobileResidency = useAppStore((s) => s.disableMobileResidency)
  const setRequestProvider = useAppStore((s) => s.setRequestProvider)
  const clearProxyEvents = useAppStore((s) => s.clearProxyEvents)
  const startProxy = useAppStore((s) => s.startProxy)
  const stopProxy = useAppStore((s) => s.stopProxy)
  const installProxyConfig = useAppStore((s) => s.installProxyConfig)
  const restoreProxyConfig = useAppStore((s) => s.restoreProxyConfig)
  const updateProxyConfig = useAppStore((s) => s.updateProxyConfig)
  const sendProxyTestRequest = useAppStore((s) => s.sendProxyTestRequest)
  const [testingProxy, setTestingProxy] = useState(false)
  const [proxyTestResult, setProxyTestResult] = useState<ProxyTestResult | null>(null)

  const account = accounts.find((a) => a.name === activeAccount) ?? accounts[0] ?? null
  const residency = proxyState.mobileResidency
  const requestName = proxyState.requestProvider?.name ?? activeAccount ?? '—'
  const diskName = residency.diskAccount ?? activeAccount ?? '—'
  const requestProvider = proxyState.requestProvider
  const routePoolCount = proxyState.providers.filter((provider) => provider.enabled && provider.includeInFailover).length
  const latestInferenceRequest = proxyState.recentRequests.find((request) => request.category === 'inference')
  const latestBackgroundRequest = proxyState.recentRequests.find((request) => request.category !== 'inference')
  const proxyStatusText = proxyState.status === 'running' ? proxyState.listenUrl ?? '运行中' : proxyState.status === 'error' ? '状态异常' : '未运行'

  const runProxyTest = async () => {
    setTestingProxy(true)
    try {
      setProxyTestResult(await sendProxyTestRequest())
    } finally {
      setTestingProxy(false)
    }
  }

  return (
    <main data-component="ProxyRoutingPage" className="flex-1 overflow-y-auto min-w-0">
      <div className="p-6 max-w-[920px] mx-auto space-y-5">
        <div className="pb-2">
          <p className="text-[10px] uppercase tracking-[0.18em] text-primary font-medium">Routing</p>
          <h1 className="text-2xl font-semibold text-fg font-serif mt-1">路由代理</h1>
          <p className="text-xs text-fg-subtle mt-1">管理本地代理、请求出口、移动端驻留和故障转移。</p>
        </div>

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
                    后台/手机远程请求走驻留账号 {residency.accountName}，推理请求走请求出口 {requestName}。
                  </p>
                )}
                {residency.enabled && !proxyState.codexConfig.installed && (
                  <p className="text-[11px] text-warning mt-2">
                    驻留只保持磁盘账号，Codex 未接管时模型请求不会走代理。
                  </p>
                )}
                {[...residency.warnings, ...proxyState.warnings].map((warning) => (
                  <p key={warning} className="text-[11px] text-warning mt-1">{warning}</p>
                ))}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => void (residency.enabled ? disableMobileResidency() : enableMobileResidency())}
                className={cn(
                  'px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors',
                  residency.enabled
                    ? 'text-warning bg-warning-muted hover:bg-warning/20'
                    : 'text-primary bg-primary-muted hover:bg-primary/15'
                )}
              >
                {residency.enabled ? '关闭驻留' : '启用驻留'}
              </button>
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
                  当前账号设为出口
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-2 rounded-xl border border-line bg-bg-surface card-ring p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <RadioTower className="w-3.5 h-3.5 text-primary" />
                <h2 className="text-sm font-semibold text-fg font-serif">代理状态</h2>
              </div>
              <button
                onClick={() => void (proxyState.status === 'running' ? stopProxy() : startProxy())}
                className={cn(
                  'px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors',
                  proxyState.status === 'running'
                    ? 'text-warning bg-warning-muted hover:bg-warning/20'
                    : 'text-white bg-primary hover:bg-primary-hover'
                )}
              >
                {proxyState.status === 'running' ? '停止代理' : '启动代理'}
              </button>
            </div>
            <div className="space-y-2">
              <ProxyMetric label="运行状态" value={proxyStatusText} tone={proxyState.status === 'running' ? 'success' : proxyState.status === 'error' ? 'warning' : undefined} />
              <ProxyMetric label="真实监听" value={proxyState.diagnostics.portReachable ? '端口可达' : '端口不可达'} tone={proxyState.diagnostics.portReachable ? 'success' : proxyState.config.enabled ? 'warning' : undefined} />
              <ProxyMetric label="Codex 接管" value={proxyState.codexConfig.installed ? '已接管' : '未接管'} tone={proxyState.codexConfig.installed ? 'success' : proxyState.config.installCodexConfig ? 'warning' : undefined} />
              <ProxyMetric label="自动故障转移" value={proxyState.config.routing.automaticFailover ? `已启用 · ${routePoolCount} 个出口` : '未启用'} tone={proxyState.config.routing.automaticFailover ? 'success' : undefined} />
              <ProxyMetric label="当前出口" value={requestProvider ? `${requestProvider.name} · ${providerHealthText(requestProvider.health.status)}` : requestName} tone={requestProvider?.health.status === 'cooling_down' || requestProvider?.health.status === 'invalid' ? 'warning' : undefined} />

              <div className="rounded-lg bg-bg-elevated/60 border border-line-subtle px-2.5 py-2 space-y-2">
                <label className="block">
                  <span className="text-[10px] text-fg-subtle">请求出口</span>
                  <select
                    value={proxyState.config.routing.requestProviderId ?? ''}
                    onChange={(event) => void setRequestProvider(event.target.value || undefined)}
                    disabled={proxyState.status !== 'running'}
                    className="mt-1 w-full px-2 py-1.5 rounded-md text-[11px] bg-bg border border-line text-fg focus:border-primary focus:outline-none disabled:opacity-60"
                  >
                    <option value="">默认当前账号</option>
                    {proxyState.providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name} · {providerKindLabel(provider.kind)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <QuickToggle
                    label="故障转移"
                    active={proxyState.config.routing.automaticFailover}
                    onClick={() => void updateProxyConfig({
                      ...proxyState.config,
                      routing: {
                        ...proxyState.config.routing,
                        automaticFailover: !proxyState.config.routing.automaticFailover,
                      },
                    })}
                  />
                  <QuickToggle
                    label="第三方后端"
                    active={proxyState.config.routing.allowThirdPartyFailover}
                    onClick={() => void updateProxyConfig({
                      ...proxyState.config,
                      routing: {
                        ...proxyState.config.routing,
                        allowThirdPartyFailover: !proxyState.config.routing.allowThirdPartyFailover,
                      },
                    })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button onClick={() => void installProxyConfig()} className="px-2 py-1.5 rounded-md text-[11px] font-medium text-primary bg-primary-muted hover:bg-primary/15 transition-colors">
                    接管 Codex
                  </button>
                  <button onClick={() => void restoreProxyConfig()} className="px-2 py-1.5 rounded-md text-[11px] font-medium text-fg-muted bg-bg hover:bg-bg-hover border border-line-subtle transition-colors">
                    恢复配置
                  </button>
                </div>
                <button
                  onClick={() => void runProxyTest()}
                  disabled={proxyState.status !== 'running' || testingProxy}
                  className="w-full px-2 py-1.5 rounded-md text-[11px] font-medium text-white bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:hover:bg-primary transition-colors"
                >
                  <RefreshCw className={cn('inline w-3 h-3 mr-1', testingProxy && 'animate-spin')} />
                  {testingProxy ? '测试中' : '发送测试请求'}
                </button>
                {proxyTestResult && (
                  <div className="rounded-md bg-bg border border-line-subtle px-2 py-1.5 text-[10px] text-fg-subtle space-y-0.5">
                    <p className="text-fg">测试结果：{proxyTestResult.success ? '成功' : '失败'} · {proxyTestResult.statusCode ?? '无状态码'}</p>
                    <p>目标：{proxyTestResult.targetProvider ?? '默认路由'} · 实际：{proxyTestResult.actualProvider ?? '未知'}</p>
                    <p>{proxyTestResult.method} · {proxyTestResult.path} · {proxyTestResult.durationMs}ms{proxyTestResult.failoverHappened ? ' · 已故障转移' : ''}</p>
                  </div>
                )}
              </div>

              {latestInferenceRequest ? (
                <RequestSummary title="最近推理请求" request={latestInferenceRequest} />
              ) : (
                <div className="rounded-lg bg-bg-elevated/60 border border-line-subtle px-3 py-2">
                  <p className="text-[10px] text-fg-subtle">暂无推理请求。请用“发送测试请求”或在 Codex 中发起模型请求验证出口。</p>
                </div>
              )}
              {latestBackgroundRequest && <RequestSummary title="最近后台请求" request={latestBackgroundRequest} muted />}
            </div>
          </div>

          <div className="col-span-3 rounded-xl border border-line bg-bg-surface card-ring p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <History className="w-3.5 h-3.5 text-fg-muted" />
                <h2 className="text-sm font-semibold text-fg font-serif">最近故障转移</h2>
              </div>
              <span className="text-[10px] text-fg-subtle">最多保留 50 条</span>
              {(proxyState.recentFailovers.length > 0 || proxyState.recentRequests.length > 0) && (
                <button
                  onClick={() => void clearProxyEvents()}
                  className="px-2 py-1 rounded-md text-[10px] font-medium text-fg-muted bg-bg-elevated hover:bg-bg-hover"
                >
                  清空记录
                </button>
              )}
            </div>
            {proxyState.recentFailovers.length > 0 ? (
              <div className="space-y-2">
                {proxyState.recentFailovers.slice(0, 8).map((event) => (
                  <div key={event.id} className="rounded-lg bg-bg-elevated/60 border border-line-subtle px-3 py-2">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
                      <span className="text-fg truncate min-w-0">{event.fromProvider} → {event.toProvider ?? '无可用出口'}</span>
                      <span className="text-fg-subtle ml-auto shrink-0">{formatDate(event.time)}</span>
                    </div>
                    <p className="text-[10px] text-fg-subtle mt-1 truncate" title={event.reason}>
                      {event.statusCode ? `${event.statusCode} · ` : ''}{event.reason}
                    </p>
                    {(event.method || event.path) && (
                      <p className="text-[10px] text-fg-subtle/80 mt-0.5 truncate" title={`${event.method ?? ''} ${event.path ?? ''}`}>
                        {[event.method, event.path, event.replaySafe ? '已安全重放' : undefined].filter(Boolean).join(' · ')}
                      </p>
                    )}
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
      </div>
    </main>
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
      <span className={cn('text-[11px] font-medium truncate text-right', tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-fg')} title={value}>
        {value}
      </span>
    </div>
  )
}

function QuickToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2 py-1.5 rounded-md text-[11px] font-medium border transition-colors',
        active ? 'text-success bg-success-muted border-success/20' : 'text-fg-muted bg-bg border-line-subtle hover:text-fg hover:bg-bg-hover'
      )}
    >
      {label} · {active ? '开' : '关'}
    </button>
  )
}

function RequestSummary({ title, request, muted }: { title: string; request: { success: boolean; method: string; path: string; durationMs: number; statusCode?: number; provider?: string; attempts: number; error?: string; category: string }; muted?: boolean }) {
  return (
    <div className={cn('rounded-lg border border-line-subtle px-3 py-2', muted ? 'bg-bg-elevated/40' : 'bg-bg-elevated/60')}>
      <p className="text-[10px] text-fg-subtle mb-1">{title}</p>
      <div className="flex items-center gap-2 text-[11px]">
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', request.success ? 'bg-success' : 'bg-warning')} />
        <span className="text-fg truncate min-w-0" title={request.path}>
          {requestCategoryLabel(request.category)} · {request.method} · {request.path}
        </span>
        <span className="text-fg-subtle ml-auto shrink-0">{request.durationMs}ms</span>
      </div>
      <p className="text-[10px] text-fg-subtle mt-1 truncate" title={request.error ?? request.provider ?? ''}>
        {[request.statusCode ?? '无状态码', request.provider ?? '未选择出口', `${request.attempts} 次尝试`].join(' · ')}
      </p>
    </div>
  )
}

function providerHealthText(status: string): string {
  if (status === 'healthy') return '正常'
  if (status === 'cooling_down') return '冷却中'
  if (status === 'disabled') return '已停用'
  if (status === 'invalid') return '异常'
  return '待验证'
}

function providerKindLabel(kind: string): string {
  if (kind === 'chat_gpt_oauth') return 'OAuth'
  if (kind === 'open_ai_api_key') return 'API Key'
  if (kind === 'open_ai_compatible') return 'Relay'
  if (kind === 'glm') return 'GLM'
  if (kind === 'mimo') return 'MiMo'
  if (kind === 'deep_seek') return 'DeepSeek'
  if (kind === 'custom_chat_completions') return 'Chat Completions'
  return 'Provider'
}

function requestCategoryLabel(category: string): string {
  if (category === 'inference') return '推理'
  if (category === 'codex_backend') return 'Codex 后台'
  if (category === 'mobile_residency') return '移动端驻留'
  if (category === 'remote_control') return '远程控制'
  if (category === 'telemetry') return 'Telemetry'
  if (category === 'models') return '模型列表'
  return '后台'
}
