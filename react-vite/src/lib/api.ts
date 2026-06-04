import { invoke } from '@tauri-apps/api/core'
import type { AccountMeta, CodexAuthStatus, CodexUsageInfo, AppSettings, AppLog, AppState, SubscriptionInfo, SubscriptionPlan, TokenUsageSummary, NewAccountLoginPreparation } from './types'

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

export async function addCurrentAccount(name: string, note?: string, overwrite?: boolean): Promise<AccountMeta> {
  const account = await invoke<AccountMeta>('add_account', { name, note: note ?? null, overwrite: overwrite ?? false })
  addLog('success', `已添加账号「${name}」`)
  return account
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
  const priorityAccounts = [...accounts]
    .filter((a) => !a.isActive && a.priority)
  const candidates = priorityAccounts.length > 0 ? priorityAccounts : accounts.filter((a) => !a.isActive)
  const sorted = candidates.sort((a, b) => a.name.localeCompare(b.name))
  for (const acc of sorted) {
    const usage5h = acc.usage?.windows.find((w) => w.window === '5h')
    if (!usage5h || (usage5h.percentage != null && usage5h.percentage < 90)) {
      return acc
    }
  }
  return sorted[0] ?? null
}
