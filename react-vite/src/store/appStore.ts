import { create } from 'zustand'
import type { AccountMeta, CodexAuthStatus, AppLog, AppSettings, RefreshProgress, ToastItem, SubscriptionPlan, CodexUsageInfo, DailyUsageEntry, TokenUsageSummary } from '@/lib/types'
import * as api from '@/lib/api'

const USAGE_HISTORY_KEY = 'codex-switcher:daily-usage-history:v1'
const USAGE_HISTORY_LIMIT_DAYS = 182

function dateKeyFromIso(iso: string): string {
  const d = new Date(iso)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function loadUsageHistory(): DailyUsageEntry[] {
  try {
    const raw = window.localStorage.getItem(USAGE_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DailyUsageEntry[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry) => entry.date && typeof entry.total === 'number')
  } catch {
    return []
  }
}

function saveUsageHistory(history: DailyUsageEntry[]) {
  window.localStorage.setItem(USAGE_HISTORY_KEY, JSON.stringify(history))
}

function trimUsageHistory(history: DailyUsageEntry[]): DailyUsageEntry[] {
  return [...history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-USAGE_HISTORY_LIMIT_DAYS)
}

function usageScore(usage: CodexUsageInfo): number {
  const fiveHour = usage.windows.find((w) => w.window === '5h')?.percentage ?? 0
  const sevenDay = usage.windows.find((w) => w.window === '7d')?.percentage ?? 0
  return Math.max(fiveHour, sevenDay)
}

function mergeUsageIntoHistory(history: DailyUsageEntry[], usage: CodexUsageInfo): DailyUsageEntry[] {
  const date = dateKeyFromIso(usage.fetchedAt)
  const score = usageScore(usage)
  const fiveHour = usage.windows.find((w) => w.window === '5h')?.percentage ?? 0
  const sevenDay = usage.windows.find((w) => w.window === '7d')?.percentage ?? 0
  const existing = history.find((entry) => entry.date === date)
  const entry: DailyUsageEntry = existing
    ? {
        ...existing,
        accounts: { ...existing.accounts, [usage.accountName]: score },
      }
    : {
        date,
        total: 0,
        samples: 0,
        maxFiveHourPercentage: 0,
        maxSevenDayPercentage: 0,
        accounts: { [usage.accountName]: score },
      }

  entry.total = Object.values(entry.accounts).reduce((sum, value) => sum + value, 0)
  entry.samples = Object.keys(entry.accounts).length
  entry.maxFiveHourPercentage = Math.max(entry.maxFiveHourPercentage, fiveHour)
  entry.maxSevenDayPercentage = Math.max(entry.maxSevenDayPercentage, sevenDay)

  const next = history.filter((item) => item.date !== date)
  next.push(entry)
  return trimUsageHistory(next)
}

interface AppStore {
  accounts: AccountMeta[]
  authStatus: CodexAuthStatus | null
  selectedAccount: string | null
  activeAccount: string | null
  logs: AppLog[]
  settings: AppSettings
  theme: 'system' | 'light' | 'dark'
  loading: boolean
  isRefreshingAuth: boolean
  isRefreshingAll: boolean
  refreshingUsageAccount: string | null
  isRefreshingTokenUsage: boolean
  refreshProgress: RefreshProgress | null
  toasts: ToastItem[]
  switchTarget: string | null
  subscriptionOverrideTarget: string | null
  usageHistory: DailyUsageEntry[]
  tokenUsage: TokenUsageSummary | null

  init: () => Promise<void>
  selectAccount: (name: string) => void
  switchToAccount: (name: string) => Promise<void>
  addAccount: (name: string, note?: string, overwrite?: boolean) => Promise<void>
  deleteAccount: (name: string, force?: boolean) => Promise<void>
  renameAccount: (oldName: string, newName: string) => Promise<void>
  refreshAuth: () => Promise<void>
  saveActive: () => Promise<void>
  refreshUsage: (name?: string) => Promise<void>
  refreshAllUsage: (silent?: boolean) => Promise<void>
  updateSettings: (s: Partial<AppSettings>) => Promise<void>
  setTheme: (t: 'system' | 'light' | 'dark') => void
  addToast: (level: ToastItem['level'], message: string) => void
  removeToast: (id: string) => void
  setSwitchTarget: (name: string | null) => void
  getSelectedAccountData: () => AccountMeta | null
  applyTheme: (t: 'system' | 'light' | 'dark') => void
  setSubscriptionOverride: (accountName: string, plan: SubscriptionPlan) => Promise<void>
  clearSubscriptionOverride: (accountName: string) => Promise<void>
  openSubscriptionOverrideDialog: (name: string) => void
  closeSubscriptionOverrideDialog: () => void
  togglePriority: (name: string) => Promise<void>
  recordUsageSnapshot: (usage: CodexUsageInfo) => void
  refreshTokenUsage: () => Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => ({
  accounts: [],
  authStatus: null,
  selectedAccount: null,
  activeAccount: null,
  logs: [],
  settings: {
    autoDetectCodexHome: true,
    refreshUsageOnStartup: true,
    refreshUsageAfterSwitch: true,
    refreshUsageIntervalMinutes: 15,
    restorePreviousAfterUsageCheck: true,
    backupRetention: 10,
    enableUsageQuery: true,
    theme: 'dark',
  },
  theme: 'dark',
  loading: true,
  isRefreshingAuth: false,
  isRefreshingAll: false,
  refreshingUsageAccount: null,
  isRefreshingTokenUsage: false,
  refreshProgress: null,
  toasts: [],
  switchTarget: null,
  subscriptionOverrideTarget: null,
  usageHistory: loadUsageHistory(),
  tokenUsage: null,

  init: async () => {
    set({ loading: true })
    try {
      const state = await api.getAppState()
      set({
        accounts: state.accounts,
        authStatus: state.authStatus,
        activeAccount: state.activeAccount ?? null,
        selectedAccount: state.selectedAccount ?? state.activeAccount ?? null,
        logs: state.logs,
        settings: state.settings,
        theme: state.settings.theme,
        loading: false,
      })
      get().applyTheme(state.settings.theme)
      void get().refreshTokenUsage()
      if (state.settings.enableUsageQuery && state.settings.refreshUsageOnStartup && state.accounts.length > 0) {
        void get().refreshAllUsage(true)
      }
    } catch (e: unknown) {
      set({ loading: false })
      get().addToast('error', e instanceof Error ? e.message : '初始化失败')
    }
  },

  selectAccount: (name) => set({ selectedAccount: name }),

  switchToAccount: async (name) => {
    try {
      await api.switchAccount(name)
      const accounts = await api.listAccounts()
      const authStatus = await api.detectCodexAuth()
      set({
        accounts,
        authStatus,
        activeAccount: name,
        selectedAccount: name,
        logs: api.getLogs(),
        switchTarget: null,
      })
      get().addToast('success', `已切换到账号「${name}」`)
      void get().refreshTokenUsage()
      if (get().settings.enableUsageQuery && get().settings.refreshUsageAfterSwitch) {
        void get().refreshUsage(name)
      }
    } catch (e: unknown) {
      get().addToast('error', e instanceof Error ? e.message : '切换失败')
    }
  },

  addAccount: async (name, note, overwrite) => {
    try {
      await api.addCurrentAccount(name, note, overwrite)
      const accounts = await api.listAccounts()
      const active = accounts.find((account) => account.isActive)?.name ?? name
      const authStatus = await api.detectCodexAuth()
      set({ accounts, authStatus, activeAccount: active, selectedAccount: active, logs: api.getLogs() })
      get().addToast('success', `已添加账号「${name}」`)
      void get().refreshTokenUsage()
      if (get().settings.enableUsageQuery) {
        void get().refreshUsage(name)
      }
    } catch (e: unknown) {
      throw e
    }
  },

  deleteAccount: async (name, force) => {
    try {
      await api.removeAccount(name, force)
      const accounts = await api.listAccounts()
      const state = get()
      set({
        accounts,
        logs: api.getLogs(),
        selectedAccount: state.selectedAccount === name ? null : state.selectedAccount,
      })
      get().addToast('success', `已删除账号「${name}」`)
    } catch (e: unknown) {
      get().addToast('error', e instanceof Error ? e.message : '删除失败')
    }
  },

  renameAccount: async (oldName, newName) => {
    try {
      await api.renameAccount(oldName, newName)
      const accounts = await api.listAccounts()
      const state = get()
      set({
        accounts,
        logs: api.getLogs(),
        activeAccount: state.activeAccount === oldName ? newName : state.activeAccount,
        selectedAccount: state.selectedAccount === oldName ? newName : state.selectedAccount,
      })
    } catch (e: unknown) {
      get().addToast('error', e instanceof Error ? e.message : '重命名失败')
      throw e
    }
  },

  refreshAuth: async () => {
    if (get().isRefreshingAuth) return
    set({ isRefreshingAuth: true })
    try {
      const authStatus = await api.detectCodexAuth()
      set({ authStatus, logs: api.getLogs() })
    } catch (e: unknown) {
      get().addToast('error', e instanceof Error ? e.message : '检测失败')
    } finally {
      set({ isRefreshingAuth: false })
    }
  },

  saveActive: async () => {
    try {
      await api.saveActiveAccount()
      set({ logs: api.getLogs() })
      get().addToast('success', '已保存当前账号状态')
    } catch (e: unknown) {
      get().addToast('error', e instanceof Error ? e.message : '保存失败')
    }
  },

  refreshUsage: async (name) => {
    const target = name ?? get().activeAccount
    if (!target || get().refreshingUsageAccount === target) return
    set({ refreshingUsageAccount: target })
    try {
      const usage = name
        ? await api.fetchUsageForAccount(name, get().settings.restorePreviousAfterUsageCheck)
        : await api.fetchUsageForActiveAccount()
      const accounts = get().accounts.map((a) =>
        a.name === usage.accountName
          ? { ...a, usage, subscription: usage.subscription ?? a.subscription, lastUsageCheckAt: usage.fetchedAt }
          : a
      )
      get().recordUsageSnapshot(usage)
      set({ accounts, logs: api.getLogs() })
      void get().refreshTokenUsage()
    } catch (e: unknown) {
      get().addToast('error', e instanceof Error ? e.message : '查询失败')
    } finally {
      set({ refreshingUsageAccount: null })
    }
  },

  refreshAllUsage: async (silent = false) => {
    if (get().isRefreshingAll || !get().settings.enableUsageQuery || get().accounts.length === 0) return
    set({ isRefreshingAll: true, refreshProgress: null })
    try {
      const usages = await api.refreshAllUsage(
        get().settings.restorePreviousAfterUsageCheck,
        (current, total, name) => {
          if (silent) return
          set({
            refreshProgress: { current, total, currentName: name, succeeded: 0, failed: 0, done: false },
          })
        }
      )
      const usageByAccount = new Map(usages.map((usage) => [usage.accountName, usage]))
      usages.forEach((usage) => get().recordUsageSnapshot(usage))
      const accounts = get().accounts.map((account) => {
        const usage = usageByAccount.get(account.name)
        if (!usage) return account
        return {
          ...account,
          usage,
          subscription: usage.subscription ?? account.subscription,
          lastUsageCheckAt: usage.fetchedAt,
        }
      })
      set({
        accounts,
        logs: api.getLogs(),
        isRefreshingAll: false,
        refreshProgress: silent ? null : {
          current: accounts.length,
          total: accounts.length,
          currentName: '',
          succeeded: usages.length,
          failed: Math.max(0, accounts.length - usages.length),
          done: true,
        },
      })
      void get().refreshTokenUsage()
      if (!silent) setTimeout(() => set({ refreshProgress: null }), 4000)
    } catch (e: unknown) {
      set({ isRefreshingAll: false, refreshProgress: null })
      if (!silent) get().addToast('error', e instanceof Error ? e.message : '批量刷新失败')
    }
  },

  updateSettings: async (partial) => {
    try {
      const merged = { ...get().settings, ...partial }
      const saved = await api.updateSettings(merged)
      set({ settings: saved, logs: api.getLogs() })
      if (partial.theme) get().applyTheme(partial.theme)
      get().addToast('success', '设置已保存')
    } catch (e: unknown) {
      get().addToast('error', e instanceof Error ? e.message : '保存设置失败')
    }
  },

  setTheme: (t) => get().applyTheme(t),

  applyTheme: (t: 'system' | 'light' | 'dark') => {
    const html = document.documentElement
    html.classList.remove('dark', 'light')
    if (t === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      html.classList.add(prefersDark ? 'dark' : 'light')
    } else {
      html.classList.add(t)
    }
    set({ theme: t })
  },

  addToast: (level, message) => {
    const id = Math.random().toString(36).slice(2, 10)
    const toast: ToastItem = { id, level, message }
    set((s) => ({ toasts: [...s.toasts, toast] }))
    setTimeout(() => get().removeToast(id), 4000)
  },

  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setSwitchTarget: (name) => set({ switchTarget: name }),

  openSubscriptionOverrideDialog: (name) => set({ subscriptionOverrideTarget: name }),
  closeSubscriptionOverrideDialog: () => set({ subscriptionOverrideTarget: null }),

  setSubscriptionOverride: async (accountName, plan) => {
    try {
      const updated = await api.setManualSubscriptionOverride(accountName, plan)
      const allAccounts = await api.listAccounts()
      set({ accounts: allAccounts, logs: api.getLogs(), subscriptionOverrideTarget: null })
      get().addToast('success', `已设置 ${accountName} 的订阅类型为 ${updated.subscription?.displayName}`)
    } catch (e: unknown) {
      get().addToast('error', e instanceof Error ? e.message : '设置订阅类型失败')
    }
  },

  clearSubscriptionOverride: async (accountName) => {
    try {
      await api.clearManualSubscriptionOverride(accountName)
      const allAccounts = await api.listAccounts()
      set({ accounts: allAccounts, logs: api.getLogs(), subscriptionOverrideTarget: null })
      get().addToast('success', `已恢复 ${accountName} 的自动识别`)
    } catch (e: unknown) {
      get().addToast('error', e instanceof Error ? e.message : '清除订阅覆盖失败')
    }
  },

  togglePriority: async (name) => {
    try {
      await api.togglePriority(name)
      const allAccounts = await api.listAccounts()
      set({ accounts: allAccounts, logs: api.getLogs() })
    } catch (e: unknown) {
      get().addToast('error', e instanceof Error ? e.message : '设置优先失败')
    }
  },

  recordUsageSnapshot: (usage) => {
    const history = mergeUsageIntoHistory(get().usageHistory, usage)
    saveUsageHistory(history)
    set({ usageHistory: history })
  },

  refreshTokenUsage: async () => {
    if (get().isRefreshingTokenUsage) return
    set({ isRefreshingTokenUsage: true })
    try {
      const tokenUsage = await api.getTokenUsageSummary()
      set({ tokenUsage, logs: api.getLogs() })
    } catch (e: unknown) {
      get().addToast('error', e instanceof Error ? e.message : 'Token 统计失败')
    } finally {
      set({ isRefreshingTokenUsage: false })
    }
  },

  getSelectedAccountData: () => {
    const s = get()
    if (!s.selectedAccount) return null
    return s.accounts.find((a) => a.name === s.selectedAccount) ?? null
  },
}))
