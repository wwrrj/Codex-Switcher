import { useEffect, useState, useCallback } from 'react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useAppStore } from '@/store/appStore'
import TitleBar from '@/components/TitleBar'
import AppSidebar, { type AppPage } from '@/components/AppSidebar'
import MainArea from '@/components/MainArea'
import UsageAnalyticsPage from '@/components/UsageAnalyticsPage'
import SettingsDrawer from '@/components/SettingsDrawer'
import AddAccountDialog from '@/components/AddAccountDialog'
import DeleteAccountDialog from '@/components/DeleteAccountDialog'
import RenameAccountDialog from '@/components/RenameAccountDialog'
import SetSubscriptionDialog from '@/components/SetSubscriptionDialog'
import ToastContainer from '@/components/ToastContainer'
import TrayMenu from '@/components/TrayMenu'
import SmartQuotaInviteDialog from '@/components/SmartQuotaInviteDialog'

const SIDEBAR_COLLAPSED_KEY = 'codex-switcher:sidebar-collapsed'
const SCHEDULER_LAST_ATTEMPT_KEY = 'codex-switcher:scheduler-last-attempt'

function isWithinSchedulerWindow(anchor?: string): boolean {
  if (!anchor) return false
  const [hour, minute] = anchor.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false
  const now = new Date()
  const current = now.getHours() * 60 + now.getMinutes()
  const target = hour * 60 + minute
  return current >= target && current <= target + 30
}

export default function App() {
  const windowLabel = getCurrentWindow().label

  if (windowLabel === 'tray-menu') {
    return <TrayMenu />
  }

  return <MainApp />
}

function MainApp() {
  const init = useAppStore((s) => s.init)
  const activeAccount = useAppStore((s) => s.activeAccount)
  const accountCount = useAppStore((s) => s.accounts.length)
  const enableUsageQuery = useAppStore((s) => s.settings.enableUsageQuery)
  const refreshUsageIntervalMinutes = useAppStore((s) => s.settings.refreshUsageIntervalMinutes)
  const refreshAllUsage = useAppStore((s) => s.refreshAllUsage)
  const refreshTokenUsage = useAppStore((s) => s.refreshTokenUsage)
  const refreshProxyState = useAppStore((s) => s.refreshProxyState)
  const proxyPollingEnabled = useAppStore((s) => s.proxyState.config.enabled || s.proxyState.status === 'running')
  const scheduler = useAppStore((s) => s.scheduler)
  const runSchedulerOnce = useAppStore((s) => s.runSchedulerOnce)
  const addToast = useAppStore((s) => s.addToast)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  })
  const [page, setPage] = useState<AppPage>('accounts')
  const [addOpen, setAddOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; isActive: boolean } | null>(null)
  const [schedulerInviteOpen, setSchedulerInviteOpen] = useState(false)

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    const unlistenRefresh = listen('tray-refresh-usage', () => void refreshAllUsage())
    const unlistenSwitch = listen<{ name: string; success: boolean; error?: string }>('tray-account-switched', (event) => {
      if (event.payload.success) {
        void init()
        addToast('success', `已从托盘切换到账号「${event.payload.name}」`)
      } else {
        addToast('error', event.payload.error ?? '托盘切换账号失败')
      }
    })
    return () => {
      void unlistenRefresh.then((dispose) => dispose())
      void unlistenSwitch.then((dispose) => dispose())
    }
  }, [addToast, init, refreshAllUsage])

  useEffect(() => {
    if (!enableUsageQuery || accountCount === 0) return
    const intervalMs = Math.max(1, refreshUsageIntervalMinutes || 15) * 60_000
    const timer = window.setInterval(() => {
      void refreshAllUsage(true)
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [accountCount, enableUsageQuery, refreshAllUsage, refreshUsageIntervalMinutes])

  useEffect(() => {
    const refreshCurrentTokenUsage = () => {
      if (document.visibilityState === 'visible') void refreshTokenUsage()
    }
    const timer = window.setInterval(refreshCurrentTokenUsage, 60_000)
    window.addEventListener('focus', refreshCurrentTokenUsage)
    document.addEventListener('visibilitychange', refreshCurrentTokenUsage)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshCurrentTokenUsage)
      document.removeEventListener('visibilitychange', refreshCurrentTokenUsage)
    }
  }, [refreshTokenUsage])

  useEffect(() => {
    if (!proxyPollingEnabled) return
    const refreshProxy = () => {
      if (document.visibilityState === 'visible') void refreshProxyState(true)
    }
    const timer = window.setInterval(refreshProxy, 5_000)
    window.addEventListener('focus', refreshProxy)
    document.addEventListener('visibilitychange', refreshProxy)
    refreshProxy()
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshProxy)
      document.removeEventListener('visibilitychange', refreshProxy)
    }
  }, [proxyPollingEnabled, refreshProxyState])

  useEffect(() => {
    if (scheduler.shouldShowInvite) {
      const timer = window.setTimeout(() => setSchedulerInviteOpen(true), 800)
      return () => window.clearTimeout(timer)
    }
  }, [scheduler.shouldShowInvite])

  useEffect(() => {
    if (!scheduler.config.enabled) return
    const check = () => {
      const anchor = scheduler.config.mode === 'manual'
        ? scheduler.config.manualAnchorTime
        : scheduler.analysis.recommendation?.recommendedAnchorTime
      const today = new Date().toISOString().slice(0, 10)
      const attemptKey = `${today}:${anchor ?? 'none'}`
      const alreadyAttempted = window.localStorage.getItem(SCHEDULER_LAST_ATTEMPT_KEY) === attemptKey
      if (document.visibilityState === 'visible' && isWithinSchedulerWindow(anchor) && !alreadyAttempted) {
        window.localStorage.setItem(SCHEDULER_LAST_ATTEMPT_KEY, attemptKey)
        void runSchedulerOnce()
      }
    }
    const timer = window.setInterval(check, 60_000)
    check()
    return () => window.clearInterval(timer)
  }, [runSchedulerOnce, scheduler.config.enabled, scheduler.config.mode, scheduler.config.manualAnchorTime])

  const handleDelete = useCallback(() => {
    const active = useAppStore.getState().activeAccount
    if (active) {
      setDeleteTarget({ name: active, isActive: true })
    }
  }, [])

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((value) => {
      const next = !value
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      return next
    })
  }, [])

  return (
    <div
      data-component="AppShell"
      className="h-screen flex flex-col bg-bg text-fg overflow-hidden"
      style={{ minWidth: 800, minHeight: 600 }}
    >
      <TitleBar
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={handleToggleSidebar}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex flex-1 min-h-0">
        <AppSidebar
          collapsed={sidebarCollapsed}
          page={page}
          onPageChange={setPage}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        {page === 'accounts' ? (
          <MainArea
            onRename={() => setRenameOpen(true)}
            onDelete={handleDelete}
            onAddAccount={() => setAddOpen(true)}
          />
        ) : (
          <UsageAnalyticsPage />
        )}
      </div>

      {/* Dialogs */}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AddAccountDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <DeleteAccountDialog
        targetName={deleteTarget?.name ?? null}
        isActive={deleteTarget?.isActive ?? false}
        onClose={() => setDeleteTarget(null)}
      />
      <RenameAccountDialog
        open={renameOpen}
        currentName={activeAccount ?? ''}
        onClose={() => setRenameOpen(false)}
      />
      <SetSubscriptionDialog />
      <SmartQuotaInviteDialog
        open={schedulerInviteOpen}
        onClose={() => setSchedulerInviteOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <ToastContainer />
    </div>
  )
}
