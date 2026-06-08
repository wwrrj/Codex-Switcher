import { useState, useEffect } from 'react'
import { X, RotateCcw, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import type { AppSettings, ProviderKind, PublicProviderConfig } from '@/lib/types'
import SmartQuotaSchedulerPanel from './SmartQuotaSchedulerPanel'

const defaultSettings: AppSettings = {
  autoDetectCodexHome: true,
  refreshUsageOnStartup: true,
  refreshUsageAfterSwitch: true,
  refreshUsageIntervalMinutes: 15,
  restorePreviousAfterUsageCheck: true,
  backupRetention: 10,
  enableUsageQuery: true,
  enableUsageNotifications: true,
  usageNotificationThreshold: 80,
  theme: 'dark',
}

const providerKindLabel: Record<ProviderKind, string> = {
  chat_gpt_oauth: 'ChatGPT OAuth',
  open_ai_api_key: 'OpenAI API Key',
  open_ai_compatible: 'OpenAI Relay',
  glm: 'GLM Coding Plan',
  mimo: 'MiMo Token Plan',
  deep_seek: 'DeepSeek',
  custom_chat_completions: 'Chat Completions',
}

function providerHealthLabel(provider: PublicProviderConfig): string {
  if (provider.health.status === 'cooling_down') return '冷却中'
  if (provider.health.status === 'healthy') return '正常'
  if (provider.health.status === 'disabled') return '已停用'
  if (provider.health.status === 'invalid') return '异常'
  return provider.enabled ? '待验证' : '已停用'
}

function parseModelMap(input: string): Record<string, string> {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((map, line) => {
      const index = line.indexOf('=')
      if (index <= 0) return map
      const from = line.slice(0, index).trim()
      const to = line.slice(index + 1).trim()
      if (from && to) map[from] = to
      return map
    }, {})
}

function serializeModelMap(map?: Record<string, string>): string {
  if (!map) return ''
  return Object.entries(map)
    .map(([from, to]) => `${from}=${to}`)
    .join('\n')
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function SettingsDrawer({ open, onClose }: Props) {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const accounts = useAppStore((s) => s.accounts)
  const proxyState = useAppStore((s) => s.proxyState)
  const updateProxyConfig = useAppStore((s) => s.updateProxyConfig)
  const startProxy = useAppStore((s) => s.startProxy)
  const stopProxy = useAppStore((s) => s.stopProxy)
  const installProxyConfig = useAppStore((s) => s.installProxyConfig)
  const restoreProxyConfig = useAppStore((s) => s.restoreProxyConfig)
  const setRequestProvider = useAppStore((s) => s.setRequestProvider)
  const updateProviderOptions = useAppStore((s) => s.updateProviderOptions)
  const checkProviderHealth = useAppStore((s) => s.checkProviderHealth)
  const checkAllProviderHealth = useAppStore((s) => s.checkAllProviderHealth)
  const setMobileResidencyAccount = useAppStore((s) => s.setMobileResidencyAccount)
  const enableMobileResidency = useAppStore((s) => s.enableMobileResidency)
  const disableMobileResidency = useAppStore((s) => s.disableMobileResidency)
  const clearMobileResidency = useAppStore((s) => s.clearMobileResidency)
  const restoreMobileResidency = useAppStore((s) => s.restoreMobileResidency)
  const [form, setForm] = useState<AppSettings>(settings)
  const [providerKind, setProviderKind] = useState<ProviderKind>('deep_seek')
  const [providerName, setProviderName] = useState('')
  const [providerBaseUrl, setProviderBaseUrl] = useState('')
  const [providerApiKey, setProviderApiKey] = useState('')
  const [providerModelMap, setProviderModelMap] = useState('')
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [checkingProviderId, setCheckingProviderId] = useState<string | null>(null)
  const [proxyHostDraft, setProxyHostDraft] = useState(proxyState.config.host)
  const [proxyPortDraft, setProxyPortDraft] = useState(String(proxyState.config.port))

  useEffect(() => {
    if (open) setForm(settings)
  }, [open, settings])

  useEffect(() => {
    if (!open) return
    setProxyHostDraft(proxyState.config.host)
    setProxyPortDraft(String(proxyState.config.port))
  }, [open, proxyState.config.host, proxyState.config.port])

  useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  const handleSave = async () => {
    await updateSettings(form)
    onClose()
  }

  const handleReset = () => {
    setForm({ ...defaultSettings })
  }

  const handleSaveProvider = async () => {
    const fallbackBaseUrl: Record<ProviderKind, string> = {
      chat_gpt_oauth: 'https://chatgpt.com/backend-api',
      open_ai_api_key: 'https://api.openai.com/v1',
      open_ai_compatible: 'https://example.com/v1',
      glm: 'https://open.bigmodel.cn/api/paas/v4',
      mimo: 'https://api.mimo.example/v1',
      deep_seek: 'https://api.deepseek.com/v1',
      custom_chat_completions: 'https://example.com/v1',
    }
    const name = providerName.trim() || providerKind
    const modelMap = parseModelMap(providerModelMap)
    const existingProvider = editingProviderId
      ? proxyState.providers.find((provider) => provider.id === editingProviderId)
      : undefined
    await useAppStore.getState().saveProvider({
      id: editingProviderId ?? '',
      name,
      kind: providerKind,
      enabled: existingProvider?.enabled ?? true,
      baseUrl: providerBaseUrl.trim() || fallbackBaseUrl[providerKind],
      apiKey: providerApiKey.trim() || undefined,
      modelMap: Object.keys(modelMap).length > 0 ? modelMap : undefined,
      includeInFailover: existingProvider?.includeInFailover ?? true,
      health: existingProvider?.health ?? { status: 'unknown' },
    })
    resetProviderForm()
  }

  const handleSaveProxyListenAddress = async () => {
    const host = proxyHostDraft.trim() || '127.0.0.1'
    const port = Math.max(1, Math.min(65535, parseInt(proxyPortDraft, 10) || 14550))
    setProxyHostDraft(host)
    setProxyPortDraft(String(port))
    if (host === proxyState.config.host && port === proxyState.config.port) return
    await updateProxyConfig({
      ...proxyState.config,
      host,
      port,
    })
  }

  const resetProviderForm = () => {
    setEditingProviderId(null)
    setProviderName('')
    setProviderBaseUrl('')
    setProviderApiKey('')
    setProviderModelMap('')
  }

  const handleEditProvider = (provider: PublicProviderConfig) => {
    setEditingProviderId(provider.id)
    setProviderKind(provider.kind)
    setProviderName(provider.name)
    setProviderBaseUrl(provider.baseUrl)
    setProviderApiKey('')
    setProviderModelMap(serializeModelMap(provider.modelMap))
  }

  const handleCheckProvider = async (providerId: string) => {
    setCheckingProviderId(providerId)
    try {
      await checkProviderHealth(providerId)
    } finally {
      setCheckingProviderId(null)
    }
  }

  const handleCheckAllProviders = async () => {
    setCheckingProviderId('__all__')
    try {
      await checkAllProviderHealth()
    } finally {
      setCheckingProviderId(null)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-component="SettingsDrawer">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-[380px] max-w-full h-full bg-bg-surface border-l border-line card-ring flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-line shrink-0">
          <h2 className="text-lg font-semibold text-fg tracking-tight font-serif">设置</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-hover"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Codex Home */}
          <FieldGroup label="Codex Home 路径">
            <input
              type="text"
              value={form.codexHome ?? ''}
              onChange={(e) => setForm({ ...form, codexHome: e.target.value || undefined })}
              placeholder="自动检测"
              className="w-full px-2.5 py-1.5 rounded-md text-xs bg-bg border border-line text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none"
            />
          </FieldGroup>

          {/* Toggles */}
          <FieldGroup label="功能开关">
            <ToggleRow
              label="自动检测 CODEX_HOME"
              checked={form.autoDetectCodexHome}
              onChange={(v) => setForm({ ...form, autoDetectCodexHome: v })}
            />
            <ToggleRow
              label="启动时自动刷新所有账号用量"
              checked={form.refreshUsageOnStartup}
              onChange={(v) => setForm({ ...form, refreshUsageOnStartup: v })}
            />
            <ToggleRow
              label="切换账号后自动刷新用量"
              checked={form.refreshUsageAfterSwitch}
              onChange={(v) => setForm({ ...form, refreshUsageAfterSwitch: v })}
            />
            <ToggleRow
              label="查询非当前账号用量后自动切回"
              checked={form.restorePreviousAfterUsageCheck}
              onChange={(v) => setForm({ ...form, restorePreviousAfterUsageCheck: v })}
            />
            <ToggleRow
              label="启用用量查询（实验功能）"
              checked={form.enableUsageQuery}
              onChange={(v) => setForm({ ...form, enableUsageQuery: v })}
            />
            <ToggleRow
              label="用量达到阈值时发送系统通知"
              checked={form.enableUsageNotifications}
              onChange={(v) => setForm({ ...form, enableUsageNotifications: v })}
            />
          </FieldGroup>

          <FieldGroup label="用量通知阈值">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                value={form.usageNotificationThreshold}
                onChange={(e) => setForm({ ...form, usageNotificationThreshold: Math.min(100, Math.max(1, parseInt(e.target.value) || 80)) })}
                className="w-20 px-2.5 py-1.5 rounded-md text-xs bg-bg border border-line text-fg focus:border-primary focus:outline-none"
              />
              <span className="text-xs text-fg-subtle">% 已使用</span>
            </div>
          </FieldGroup>

          <FieldGroup label="智能配额调度">
            <SmartQuotaSchedulerPanel />
          </FieldGroup>

          <FieldGroup label="本地代理">
            <div className="rounded-lg border border-line bg-bg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-fg">代理模式</p>
                  <p className="text-[11px] text-fg-subtle mt-0.5">
                    {proxyState.status === 'running' ? `运行中：${proxyState.listenUrl}` : '未运行'}
                  </p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px]',
                    proxyState.codexConfig.installed
                      ? 'text-success bg-success-muted'
                      : 'text-warning bg-warning-muted'
                  )}
                >
                  {proxyState.codexConfig.installed ? 'Codex 已接管' : 'Codex 未接管'}
                </span>
                <button
                  onClick={() => void (proxyState.status === 'running' ? stopProxy() : startProxy())}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium text-white transition-colors',
                    proxyState.status === 'running' ? 'bg-warning hover:bg-warning/80' : 'bg-primary hover:bg-primary-hover'
                  )}
                >
                  {proxyState.status === 'running' ? '停止代理' : '启动代理'}
                </button>
              </div>
              <div className="rounded-md bg-bg-elevated/60 border border-line-subtle px-3 py-2 space-y-1">
                <div className="flex justify-between gap-3 text-[11px]">
                  <span className="text-fg-muted">期望地址</span>
                  <span className="text-fg truncate" title={proxyState.codexConfig.expectedBaseUrl}>
                    {proxyState.codexConfig.expectedBaseUrl}
                  </span>
                </div>
                <div className="flex justify-between gap-3 text-[11px]">
                  <span className="text-fg-muted">当前地址</span>
                  <span className="text-fg truncate" title={proxyState.codexConfig.currentBaseUrl ?? '未设置'}>
                    {proxyState.codexConfig.currentBaseUrl ?? '未设置'}
                  </span>
                </div>
                <div className="flex justify-between gap-3 text-[11px]">
                  <span className="text-fg-muted">配置备份</span>
                  <span className="text-fg">{proxyState.codexConfig.backupExists ? '已创建' : '无备份'}</span>
                </div>
                {proxyState.codexConfig.error && (
                  <p className="text-[11px] text-warning">{proxyState.codexConfig.error}</p>
                )}
                {proxyState.warnings.length > 0 && (
                  <div className="space-y-0.5">
                    {proxyState.warnings.map((warning) => (
                      <p key={warning} className="text-[11px] text-warning">{warning}</p>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-md bg-bg-elevated/60 border border-line-subtle px-3 py-2 space-y-2">
                <div className="grid grid-cols-[1fr_92px] gap-2">
                  <label className="block">
                    <span className="text-[11px] text-fg-muted">监听地址</span>
                    <input
                      value={proxyHostDraft}
                      onChange={(event) => setProxyHostDraft(event.target.value)}
                      onBlur={() => void handleSaveProxyListenAddress()}
                      placeholder="127.0.0.1"
                      className="mt-1 w-full px-2.5 py-1.5 rounded-md text-xs bg-bg border border-line text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-fg-muted">端口</span>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={proxyPortDraft}
                      onChange={(event) => setProxyPortDraft(event.target.value)}
                      onBlur={() => void handleSaveProxyListenAddress()}
                      className="mt-1 w-full px-2.5 py-1.5 rounded-md text-xs bg-bg border border-line text-fg focus:border-primary focus:outline-none"
                    />
                  </label>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-fg-subtle">
                    默认只监听本机；运行中修改地址或端口后需要重启代理。
                  </p>
                  <button
                    onClick={() => void handleSaveProxyListenAddress()}
                    className="px-2.5 py-1 rounded-md text-[10px] font-medium text-primary bg-primary-muted hover:bg-primary/15 shrink-0"
                  >
                    保存地址
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void installProxyConfig()}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-primary bg-primary-muted hover:bg-primary/15"
                >
                  接管 Codex 配置
                </button>
                <button
                  onClick={() => void restoreProxyConfig()}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-fg-muted bg-bg-elevated hover:bg-bg-hover"
                >
                  恢复配置
                </button>
              </div>
              <label className="block">
                <span className="text-[11px] text-fg-muted">当前请求出口</span>
                <select
                  value={proxyState.config.routing.requestProviderId ?? ''}
                  onChange={(event) => void setRequestProvider(event.target.value || undefined)}
                  className="mt-1 w-full px-2.5 py-1.5 rounded-md text-xs bg-bg-elevated border border-line text-fg focus:border-primary focus:outline-none"
                >
                  <option value="">默认当前账号</option>
                  {proxyState.providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} · {providerKindLabel[provider.kind]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-md bg-bg-elevated/60 border border-line-subtle px-3 py-2 space-y-2">
                <ToggleRow
                  label="自动故障转移"
                  checked={proxyState.config.routing.automaticFailover}
                  onChange={(value) => void updateProxyConfig({
                    ...proxyState.config,
                    routing: { ...proxyState.config.routing, automaticFailover: value },
                  })}
                />
                <ToggleRow
                  label="允许切到第三方后端"
                  checked={proxyState.config.routing.allowThirdPartyFailover}
                  onChange={(value) => void updateProxyConfig({
                    ...proxyState.config,
                    routing: { ...proxyState.config.routing, allowThirdPartyFailover: value },
                  })}
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-fg-muted">最大重试</span>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={proxyState.config.routing.maxRetries}
                    onChange={(event) => void updateProxyConfig({
                      ...proxyState.config,
                      routing: { ...proxyState.config.routing, maxRetries: Math.max(0, Math.min(5, parseInt(event.target.value) || 0)) },
                    })}
                    className="w-16 px-2 py-1 rounded-md text-xs bg-bg border border-line text-fg focus:border-primary focus:outline-none"
                  />
                  <span className="text-[10px] text-fg-subtle">次</span>
                </div>
              </div>
            </div>
          </FieldGroup>

          <FieldGroup label="Relay / Plan 后端">
            <div className="rounded-lg border border-line bg-bg p-3 space-y-3">
              {editingProviderId && (
                <div className="rounded-md border border-primary/30 bg-primary-muted px-3 py-2">
                  <p className="text-[11px] font-medium text-primary">正在编辑已有后端</p>
                  <p className="text-[10px] text-fg-subtle mt-0.5">
                    密钥输入框留空会保留已保存密钥；填写新值才会替换。
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={providerKind}
                  onChange={(event) => setProviderKind(event.target.value as ProviderKind)}
                  className="px-2.5 py-1.5 rounded-md text-xs bg-bg-elevated border border-line text-fg focus:border-primary focus:outline-none"
                >
                  <option value="open_ai_compatible">OpenAI Relay</option>
                  <option value="open_ai_api_key">OpenAI API Key</option>
                  <option value="glm">GLM Coding Plan</option>
                  <option value="mimo">MiMo Token Plan</option>
                  <option value="deep_seek">DeepSeek</option>
                  <option value="custom_chat_completions">自定义 Chat Completions</option>
                </select>
                <input
                  value={providerName}
                  onChange={(event) => setProviderName(event.target.value)}
                  placeholder="显示名称"
                  className="px-2.5 py-1.5 rounded-md text-xs bg-bg-elevated border border-line text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none"
                />
              </div>
              <input
                value={providerBaseUrl}
                onChange={(event) => setProviderBaseUrl(event.target.value)}
                placeholder="Base URL，留空使用默认"
                className="w-full px-2.5 py-1.5 rounded-md text-xs bg-bg-elevated border border-line text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none"
              />
              <input
                value={providerApiKey}
                onChange={(event) => setProviderApiKey(event.target.value)}
                placeholder={editingProviderId ? 'API Key / Token（留空保留原密钥）' : 'API Key / Token（仅本地保存）'}
                type="password"
                className="w-full px-2.5 py-1.5 rounded-md text-xs bg-bg-elevated border border-line text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none"
              />
              <textarea
                value={providerModelMap}
                onChange={(event) => setProviderModelMap(event.target.value)}
                placeholder={'模型映射（可选），每行一个：\ngpt-4.1=deepseek-chat\ngpt-4.1-mini=glm-4.5'}
                rows={3}
                className="w-full px-2.5 py-1.5 rounded-md text-xs bg-bg-elevated border border-line text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none resize-none"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void handleSaveProvider()}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-primary hover:bg-primary-hover"
                >
                  {editingProviderId ? '保存后端' : '添加后端'}
                </button>
                {editingProviderId && (
                  <button
                    onClick={resetProviderForm}
                    className="px-3 py-1.5 rounded-md text-xs font-medium text-fg-muted bg-bg-elevated hover:bg-bg-hover"
                  >
                    取消编辑
                  </button>
                )}
                {proxyState.providers.some((provider) => provider.kind !== 'chat_gpt_oauth') && (
                  <button
                    onClick={() => void handleCheckAllProviders()}
                    disabled={checkingProviderId === '__all__'}
                    className="px-3 py-1.5 rounded-md text-xs font-medium text-primary bg-primary-muted hover:bg-primary/15 disabled:opacity-60"
                  >
                    <RefreshCw className={cn('inline w-3 h-3 mr-1', checkingProviderId === '__all__' && 'animate-spin')} />
                    检查全部
                  </button>
                )}
              </div>
              {proxyState.providers.filter((provider) => provider.kind !== 'chat_gpt_oauth').length > 0 && (
                <div className="space-y-2 pt-1">
                  {proxyState.providers.filter((provider) => provider.kind !== 'chat_gpt_oauth').map((provider) => (
                    <div key={provider.id} className="rounded-md bg-bg-elevated/60 border border-line-subtle px-2.5 py-2 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-fg truncate">{provider.name}</p>
                          <p className="text-[10px] text-fg-subtle truncate">
                            {providerKindLabel[provider.kind]} · {provider.hasSecret ? '已保存密钥' : '无密钥'} · {provider.modelMap && Object.keys(provider.modelMap).length > 0 ? '已配置模型映射' : '默认模型'}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px]',
                            provider.enabled ? 'text-success bg-success-muted' : 'text-fg-subtle bg-bg'
                          )}
                        >
                          {providerHealthLabel(provider)}
                        </span>
                      </div>
                      {provider.health.lastError && (
                        <p className="rounded bg-bg px-2 py-1 text-[10px] text-warning line-clamp-2">
                          {provider.health.lastError}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => void updateProviderOptions(provider.id, { enabled: !provider.enabled })}
                          className={cn(
                            'px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors',
                            provider.enabled
                              ? 'bg-success-muted text-success hover:bg-success/15'
                              : 'bg-bg text-fg-muted hover:bg-bg-hover'
                          )}
                        >
                          {provider.enabled ? '已启用' : '已停用'}
                        </button>
                        <button
                          onClick={() => void updateProviderOptions(provider.id, { includeInFailover: !provider.includeInFailover })}
                          className={cn(
                            'px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors',
                            provider.includeInFailover
                              ? 'bg-primary-muted text-primary hover:bg-primary/15'
                              : 'bg-bg text-fg-muted hover:bg-bg-hover'
                          )}
                        >
                          {provider.includeInFailover ? '参与自动切换' : '不参与切换'}
                        </button>
                        <button
                          onClick={() => void setRequestProvider(provider.id)}
                          className={cn(
                            'px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors',
                            proxyState.config.routing.requestProviderId === provider.id
                              ? 'bg-primary text-white'
                              : 'bg-bg text-fg-muted hover:bg-bg-hover'
                          )}
                        >
                          {proxyState.config.routing.requestProviderId === provider.id ? '当前出口' : '设为出口'}
                        </button>
                        <button
                          onClick={() => void handleCheckProvider(provider.id)}
                          disabled={checkingProviderId === provider.id || checkingProviderId === '__all__'}
                          className="px-2.5 py-1 rounded-md text-[10px] font-medium text-fg-muted bg-bg hover:bg-bg-hover disabled:opacity-60"
                        >
                          <RefreshCw className={cn('inline w-2.5 h-2.5 mr-1', checkingProviderId === provider.id && 'animate-spin')} />
                          测试连接
                        </button>
                        <button
                          onClick={() => handleEditProvider(provider)}
                          className="px-2.5 py-1 rounded-md text-[10px] font-medium text-fg-muted bg-bg hover:bg-bg-hover"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => void useAppStore.getState().removeProvider(provider.id)}
                          className="ml-auto px-2.5 py-1 rounded-md text-[10px] font-medium text-danger hover:bg-danger-muted"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </FieldGroup>

          <FieldGroup label="移动端驻留">
            <div className="rounded-lg border border-line bg-bg p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-fg">
                    {proxyState.mobileResidency.enabled ? '已启用' : '未启用'}
                  </p>
                  <p className="text-[11px] text-fg-subtle mt-0.5">
                    当前账号：{proxyState.mobileResidency.accountName ?? '未选择'}
                  </p>
                </div>
                <button
                  onClick={() => void (proxyState.mobileResidency.enabled ? disableMobileResidency() : enableMobileResidency())}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium text-white',
                    proxyState.mobileResidency.enabled ? 'bg-warning hover:bg-warning/80' : 'bg-primary hover:bg-primary-hover'
                  )}
                >
                  {proxyState.mobileResidency.enabled ? '关闭驻留' : '启用驻留'}
                </button>
              </div>
              <label className="block">
                <span className="text-[11px] text-fg-muted">更换移动端驻留账号</span>
                <select
                  value={proxyState.mobileResidency.accountName ?? ''}
                  onChange={(event) => {
                    const account = event.target.value
                    if (account) void setMobileResidencyAccount(account)
                  }}
                  className="mt-1 w-full px-2.5 py-1.5 rounded-md text-xs bg-bg-elevated border border-line text-fg focus:border-primary focus:outline-none"
                >
                  <option value="">请选择账号</option>
                  {accounts.map((account) => (
                    <option key={account.name} value={account.name}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              {proxyState.mobileResidency.warnings.length > 0 && (
                <div className="rounded-md bg-warning-muted border border-warning/20 px-3 py-2 space-y-1">
                  {proxyState.mobileResidency.warnings.map((warning) => (
                    <p key={warning} className="text-[11px] text-warning">{warning}</p>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => void restoreMobileResidency()}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-primary bg-primary-muted hover:bg-primary/15"
                >
                  恢复驻留
                </button>
                <button
                  onClick={() => void clearMobileResidency()}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-danger hover:bg-danger-muted"
                >
                  清除驻留
                </button>
              </div>
            </div>
          </FieldGroup>

          {/* Usage refresh interval */}
          <FieldGroup label="用量自动刷新间隔">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={1440}
                value={form.refreshUsageIntervalMinutes}
                onChange={(e) => setForm({ ...form, refreshUsageIntervalMinutes: Math.max(1, parseInt(e.target.value) || 15) })}
                className="w-20 px-2.5 py-1.5 rounded-md text-xs bg-bg border border-line text-fg focus:border-primary focus:outline-none"
              />
              <span className="text-xs text-fg-subtle">分钟</span>
            </div>
          </FieldGroup>

          {/* Backup retention */}
          <FieldGroup label="备份保留数量">
            <input
              type="number"
              min={1}
              max={100}
              value={form.backupRetention}
              onChange={(e) => setForm({ ...form, backupRetention: parseInt(e.target.value) || 10 })}
              className="w-20 px-2.5 py-1.5 rounded-md text-xs bg-bg border border-line text-fg focus:border-primary focus:outline-none"
            />
          </FieldGroup>

          {/* Theme */}
          <FieldGroup label="主题">
            <div className="flex gap-1.5">
              {(['system', 'light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, theme: t })}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    form.theme === t
                      ? 'bg-primary text-white'
                      : 'bg-bg-elevated text-fg-muted hover:bg-bg-hover'
                  )}
                >
                  {t === 'system' ? '跟随系统' : t === 'light' ? '浅色' : '深色'}
                </button>
              ))}
            </div>
          </FieldGroup>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-line shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-fg-muted hover:text-fg hover:bg-bg-hover transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            重置默认
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-md text-xs font-medium text-white bg-primary hover:bg-primary-hover transition-colors"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-fg-muted mb-2">{label}</label>
      {children}
    </div>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-fg">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          'relative w-[42px] h-6 rounded-full transition-colors shrink-0',
          checked ? 'bg-primary' : 'bg-bg-elevated border border-line'
        )}
      >
        <span
          className={cn(
            'absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-[18px]'
          )}
        />
      </button>
    </div>
  )
}
