import { useEffect, useState, useCallback } from 'react'
import { listen } from '@tauri-apps/api/event'
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

export default function App() {
  const init = useAppStore((s) => s.init)
  const activeAccount = useAppStore((s) => s.activeAccount)
  const refreshAllUsage = useAppStore((s) => s.refreshAllUsage)
  const addToast = useAppStore((s) => s.addToast)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [page, setPage] = useState<AppPage>('accounts')
  const [addOpen, setAddOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; isActive: boolean } | null>(null)

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

  const handleDelete = useCallback(() => {
    const active = useAppStore.getState().activeAccount
    if (active) {
      setDeleteTarget({ name: active, isActive: true })
    }
  }, [])

  return (
    <div
      data-component="AppShell"
      className="h-screen flex flex-col bg-bg text-fg overflow-hidden"
      style={{ minWidth: 800, minHeight: 600 }}
    >
      <TitleBar
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
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

      <ToastContainer />
    </div>
  )
}
