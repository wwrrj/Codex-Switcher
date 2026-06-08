import { invoke } from '@tauri-apps/api/core'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import type { AccountMeta, CodexAuthStatus, CodexUsageInfo, AppSettings, AppLog, AppState, SubscriptionInfo, SubscriptionPlan, TokenUsageSummary, NewAccountLoginPreparation, SwitchHistoryEntry, SwitchRecommendation, SchedulerConfig, SchedulerHistoryEntry, SchedulerState, ImportAccountsResult, ProxyState, ProviderConfig, ProxyConfig, ProviderModelList } from './types'

// ── Frontend-only log management ──

let logs: AppLog[] = []

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function addLog(level: AppLog['level'], message: string): AppLog {
  const now = new Date()
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  const log: AppLog = { id: genId(), time, level, message }
  logs = [log, ...logs].slice(0, 100)
  return log
}

export function getLogs(): AppLog[] {
  return [...logs]
}

// ── Tauri backend commands ──

export async function getAppState(): Promise<AppState> {
  const state = await invoke<AppState>('get_app_state')
  // Populate frontend logs from initial state (empty from Rust)
  logs = [...logs, ...state.logs]
  return {
    ...state,
    selectedAccount: state.activeAccount ?? undefined,
    logs,
  }
}

export async function detectCodexAuth(): Promise<CodexAuthStatus> {
  addLog('info', '已重新检测 Codex auth.json')
  return await invoke<CodexAuthStatus>('detect_codex_auth')
}

export async function refreshActiveAuthTokens(): Promise<CodexAuthStatus> {
  const status = await invoke<CodexAuthStatus>('refresh_active_auth_tokens')
  addLog('success', '已刷新 Codex OAuth token 并写回 auth.json')
  return status
}

export async function addCurrentAccount(name: string, note?: string, overwrite?: boolean): Promise<AccountMeta> {
  const account = await invoke<AccountMeta>('add_account', { name, note: note ?? null, overwrite: overwrite ?? false })
  addLog('success', `已添加账号「${name}」`)
  return account
}

export async function importAccountsFromJson(jsonText: string, overwrite?: boolean): Promise<ImportAccountsResult> {
  const result = await invoke<ImportAccountsResult>('import_accounts_from_json', {
    jsonText,
    overwrite: overwrite ?? false,
  })
  addLog('success', `已从 JSON 导入 ${result.imported.length} 个账号`)
  if (result.skipped.length > 0) {
    addLog('warning', `JSON 导入跳过 ${result.skipped.length} 项`)
  }
  return result
}

export async function prepareNewAccountLogin(): Promise<NewAccountLoginPreparation> {
  const result = await invoke<NewAccountLoginPreparation>('prepare_new_account_login')
  if (result.didLogout) {
    addLog('info', `已退出当前 Codex 账号「${result.previousAccount ?? 'unknown'}」，等待新账号登录`)
  }
  return result
}

export async function listAccounts(): Promise<AccountMeta[]> {
  return await invoke<AccountMeta[]>('list_accounts')
}

export async function switchAccount(name: string): Promise<void> {
  await invoke<void>('switch_account', { name })
  addLog('success', `已切换到账号「${name}」`)
}

export async function getProxyState(): Promise<ProxyState> {
  return await invoke<ProxyState>('get_proxy_state')
}

export async function updateProxyConfig(config: ProxyConfig): Promise<ProxyState> {
  const state = await invoke<ProxyState>('update_proxy_config', { config })
  addLog('success', '代理配置已保存')
  return state
}

export async function startProxy(): Promise<ProxyState> {
  const state = await invoke<ProxyState>('start_proxy')
  addLog('success', `本地代理已启动：${state.listenUrl ?? 'unknown'}`)
  return state
}

export async function stopProxy(): Promise<ProxyState> {
  const state = await invoke<ProxyState>('stop_proxy')
  addLog('info', '本地代理已停止')
  return state
}

export async function installCodexProxyConfig(): Promise<ProxyState> {
  const state = await invoke<ProxyState>('install_codex_proxy_config')
  addLog('success', '已接管 Codex 配置到本地代理')
  return state
}

export async function restoreCodexProxyConfig(): Promise<ProxyState> {
  const state = await invoke<ProxyState>('restore_codex_proxy_config')
  addLog('info', '已恢复 Codex 原始配置')
  return state
}

export async function setRequestProvider(providerId?: string): Promise<ProxyState> {
  const state = await invoke<ProxyState>('set_request_provider', { providerId: providerId ?? null })
  addLog('success', `当前请求出口已切换为：${state.requestProvider?.name ?? '默认账号'}`)
  return state
}

export async function saveProvider(provider: ProviderConfig): Promise<ProxyState> {
  const state = await invoke<ProxyState>('save_provider', { provider })
  addLog('success', `已保存请求出口「${provider.name}」`)
  return state
}

export async function fetchProviderModels(
  baseUrl: string,
  apiKey?: string,
  providerId?: string,
): Promise<ProviderModelList> {
  const result = await invoke<ProviderModelList>('fetch_provider_models', {
    baseUrl,
    apiKey: apiKey?.trim() || null,
    providerId: providerId || null,
  })
  addLog('success', `已读取 ${result.models.length} 个模型`)
  return result
}

export async function removeProvider(providerId: string): Promise<ProxyState> {
  const state = await invoke<ProxyState>('remove_provider', { providerId })
  addLog('info', '已删除请求出口')
  return state
}

export async function updateProviderOptions(
  providerId: string,
  options: { enabled?: boolean; includeInFailover?: boolean },
): Promise<ProxyState> {
  const state = await invoke<ProxyState>('update_provider_options', {
    providerId,
    enabled: options.enabled ?? null,
    includeInFailover: options.includeInFailover ?? null,
  })
  addLog('info', `已更新请求出口：${state.providers.find((provider) => provider.id === providerId)?.name ?? providerId}`)
  return state
}

export async function clearProxyEvents(): Promise<ProxyState> {
  const state = await invoke<ProxyState>('clear_proxy_events')
  addLog('info', '已清空代理运行记录')
  return state
}

export async function checkProviderHealth(providerId: string): Promise<ProxyState> {
  const state = await invoke<ProxyState>('check_provider_health', { providerId })
  const provider = state.providers.find((provider) => provider.id === providerId)
  addLog('info', `已检查请求出口：${provider?.name ?? providerId}`)
  return state
}

export async function checkAllProviderHealth(): Promise<ProxyState> {
  const state = await invoke<ProxyState>('check_all_provider_health')
  addLog('info', '已检查全部请求出口')
  return state
}

export async function setMobileResidencyAccount(accountName: string): Promise<ProxyState> {
  const state = await invoke<ProxyState>('set_mobile_residency_account', { accountName })
  addLog('success', `已设置移动端驻留：${accountName}`)
  return state
}

export async function enableMobileResidency(): Promise<ProxyState> {
  const state = await invoke<ProxyState>('enable_mobile_residency')
  addLog('success', '已启用移动端驻留')
  return state
}

export async function disableMobileResidency(): Promise<ProxyState> {
  const state = await invoke<ProxyState>('disable_mobile_residency')
  addLog('info', '已关闭移动端驻留')
  return state
}

export async function clearMobileResidency(): Promise<ProxyState> {
  const state = await invoke<ProxyState>('clear_mobile_residency')
  addLog('info', '已清除移动端驻留')
  return state
}

export async function restoreMobileResidency(): Promise<ProxyState> {
  const state = await invoke<ProxyState>('restore_mobile_residency')
  addLog('success', '已恢复移动端驻留状态')
  return state
}

export async function getSwitchHistory(): Promise<SwitchHistoryEntry[]> {
  return await invoke<SwitchHistoryEntry[]>('get_switch_history')
}

export async function getSchedulerState(): Promise<SchedulerState> {
  return await invoke<SchedulerState>('get_scheduler_state')
}

export async function saveSchedulerConfig(config: SchedulerConfig): Promise<SchedulerState> {
  const state = await invoke<SchedulerState>('save_scheduler_config', { config })
  addLog('success', '智能配额调度设置已保存')
  return state
}

export async function runSmartQuotaSchedulerOnce(): Promise<SchedulerHistoryEntry> {
  const entry = await invoke<SchedulerHistoryEntry>('run_smart_quota_scheduler_once')
  addLog(entry.resultStatus === 'success' ? 'success' : 'warning', `智能配额调度：${entry.resultStatus}`)
  return entry
}

export async function refreshTrayMenu(): Promise<void> {
  await invoke<void>('refresh_tray_menu')
}

export async function showMainWindow(): Promise<void> {
  await invoke<void>('show_main_window')
}

export async function hideTrayMenu(): Promise<void> {
  await invoke<void>('hide_tray_menu')
}

export async function quitApp(): Promise<void> {
  await invoke<void>('quit_app')
}

export async function saveActiveAccount(): Promise<string> {
  const msg = await invoke<string>('save_active_account')
  addLog('success', msg)
  return msg
}

export async function removeAccount(name: string, force?: boolean): Promise<void> {
  await invoke<void>('remove_account', { name, force: force ?? false })
  addLog('info', `已备份并删除账号「${name}」`)
}

export async function renameAccount(oldName: string, newName: string): Promise<void> {
  await invoke<void>('rename_account', { oldName, newName })
  addLog('success', `已将账号「${oldName}」重命名为「${newName}」`)
}

export async function togglePriority(name: string): Promise<boolean> {
  const newPriority = await invoke<boolean>('toggle_priority', { name })
  addLog('info', newPriority ? `已将 ${name} 设为优先使用` : `已取消 ${name} 的优先使用`)
  return newPriority
}

export async function updateSettings(newSettings: AppSettings): Promise<AppSettings> {
  const saved = await invoke<AppSettings>('update_settings', { settings: newSettings })
  addLog('success', '设置已保存')
  return saved
}

export async function detectCurrentAuthEmail(): Promise<string | null> {
  const email = await invoke<string | null>('detect_current_auth_email')
  if (email) addLog('info', `已识别当前 Codex 账号邮箱：${email}`)
  return email
}

// ── Usage query ──

export async function fetchUsageForActiveAccount(): Promise<CodexUsageInfo> {
  const usage = await invoke<CodexUsageInfo>('fetch_usage_for_active_account')
  addLog('success', `已刷新「${usage.accountName}」用量`)
  return usage
}

export async function fetchUsageForAccount(name: string, _restorePrevious: boolean): Promise<CodexUsageInfo> {
  const usage = await invoke<CodexUsageInfo>('fetch_usage_for_account', { name })
  addLog('success', `已刷新「${name}」用量`)
  return usage
}

export async function refreshAllUsage(
  _restorePrevious: boolean,
  onProgress?: (current: number, total: number, name: string) => void,
): Promise<CodexUsageInfo[]> {
  const accounts = await listAccounts()
  const results: CodexUsageInfo[] = []
  for (const [idx, account] of accounts.entries()) {
    onProgress?.(idx + 1, accounts.length, account.name)
    try {
      results.push(await fetchUsageForAccount(account.name, _restorePrevious))
    } catch (error) {
      addLog('warning', `刷新「${account.name}」用量失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  addLog('success', `已刷新 ${results.length} 个账号的用量`)
  return results
}

export async function openUsagePage(): Promise<void> {
  await invoke<void>('open_usage_page')
  addLog('info', '已打开 Codex Usage 页面')
}

export async function getTokenUsageSummary(): Promise<TokenUsageSummary> {
  const summary = await invoke<TokenUsageSummary>('get_token_usage_summary')
  addLog('success', `已统计 ${summary.tokenEvents} 条 token 事件`)
  return summary
}

// ── Subscription detection (stub - will use account data from backend) ──

export async function detectSubscriptionForCurrentAuth(): Promise<SubscriptionInfo> {
  const subscription = await invoke<SubscriptionInfo>('detect_subscription_for_current_auth')
  addLog('info', `当前 auth.json 订阅识别结果：${subscription.displayName}`)
  return subscription
}

export async function detectSubscriptionForAccount(name: string): Promise<SubscriptionInfo> {
  const subscription = await invoke<SubscriptionInfo>('detect_subscription_for_account', { name })
  addLog('info', `账号「${name}」订阅识别结果：${subscription.displayName}`)
  return subscription
}

export async function setManualSubscriptionOverride(
  accountName: string,
  plan: SubscriptionPlan,
): Promise<AccountMeta> {
  const account = await invoke<AccountMeta>('set_manual_subscription_override', { name: accountName, plan })
  addLog('success', `已手动设置「${accountName}」订阅类型`)
  return account
}

export async function clearManualSubscriptionOverride(
  accountName: string,
): Promise<AccountMeta> {
  const account = await invoke<AccountMeta>('clear_manual_subscription_override', { name: accountName })
  addLog('success', `已清除「${accountName}」手动订阅覆盖`)
  return account
}

// ── Auto-switch target (frontend-only computation) ──

export function getAutoSwitchTarget(accounts: AccountMeta[]): AccountMeta | null {
  return getSmartSwitchRecommendation(accounts)?.account ?? null
}

export function getSmartSwitchRecommendation(accounts: AccountMeta[]): SwitchRecommendation | null {
  const candidates = accounts.filter((account) => !account.isActive && account.health !== 'expired' && account.health !== 'invalid')
  const scored = candidates.map((account) => {
    const fiveHour = account.usage?.windows.find((window) => window.window === '5h')?.percentage
    const sevenDay = account.usage?.windows.find((window) => window.window === '7d')?.percentage
    const usagePenalty = (fiveHour ?? 35) * 0.65 + (sevenDay ?? 35) * 0.35
    const priorityBonus = account.priority ? 18 : 0
    const healthPenalty = account.health === 'expiring_soon' ? 20 : 0
    const score = Math.round(100 - usagePenalty + priorityBonus - healthPenalty)
    const reason = account.priority
      ? `优先账号，5h 剩余 ${fiveHour == null ? '未知' : `${Math.max(0, 100 - fiveHour)}%`}`
      : fiveHour == null
        ? '账号健康，等待首次用量查询'
        : `综合剩余额度最佳，5h 剩余 ${Math.max(0, 100 - fiveHour)}%`
    return { account, score, reason }
  })
  return scored.sort((a, b) => b.score - a.score || a.account.name.localeCompare(b.account.name))[0] ?? null
}

export async function notifyUsageThreshold(usages: CodexUsageInfo[], settings: AppSettings): Promise<void> {
  if (!settings.enableUsageNotifications) return
  let granted = await isPermissionGranted()
  if (!granted) granted = await requestPermission() === 'granted'
  if (!granted) return

  const threshold = Math.min(100, Math.max(1, settings.usageNotificationThreshold))
  for (const usage of usages) {
    for (const usageWindow of usage.windows) {
      const percentage = usageWindow.percentage ?? 0
      if (percentage < threshold) continue
      const key = `codex-switcher:usage-alert:${usage.accountName}:${usageWindow.window}:${threshold}:${usageWindow.resetAt ?? 'unknown'}`
      if (window.localStorage.getItem(key)) continue
      sendNotification({
        title: `${usage.accountName} 用量提醒`,
        body: `${usageWindow.window} 窗口已使用 ${Math.round(percentage)}%，建议切换到剩余额度更多的账号。`,
      })
      window.localStorage.setItem(key, new Date().toISOString())
    }
  }
}
