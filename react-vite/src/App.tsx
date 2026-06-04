import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/store/appStore'
import TopBar from '@/components/TopBar'
import MainArea from '@/components/MainArea'
import SettingsDrawer from '@/components/SettingsDrawer'
import AddAccountDialog from '@/components/AddAccountDialog'
import DeleteAccountDialog from '@/components/DeleteAccountDialog'
import RenameAccountDialog from '@/components/RenameAccountDialog'
import SetSubscriptionDialog from '@/components/SetSubscriptionDialog'
import ToastContainer from '@/components/ToastContainer'

export default function App() {
  const init = useAppStore((s) => s.init)
  const activeAccount = useAppStore((s) => s.activeAccount)
  const accountCount = useAppStore((s) => s.accounts.length)
  const enableUsageQuery = useAppStore((s) => s.settings.enableUsageQuery)
  const refreshUsageIntervalMinutes = useAppStore((s) => s.settings.refreshUsageIntervalMinutes)
  const refreshAllUsage = useAppStore((s) => s.refreshAllUsage)
  const refreshTokenUsage = useAppStore((s) => s.refreshTokenUsage)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; isActive: boolean } | null>(null)

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    if (!enableUsageQuery || accountCount === 0) return

    const intervalMs = Math.max(1, refreshUsageIntervalMinutes || 15) * 60_000
    const timer = window.setInterval(() => {
      void refreshAllUsage(true)
      void refreshTokenUsage()
    }, intervalMs)

    return () => window.clearInterval(timer)
  }, [accountCount, enableUsageQuery, refreshAllUsage, refreshTokenUsage, refreshUsageIntervalMinutes])

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
      <TopBar />

      <MainArea
        onRename={() => setRenameOpen(true)}
        onDelete={handleDelete}
        onAddAccount={() => setAddOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

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
