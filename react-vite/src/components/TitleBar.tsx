import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  CheckCircle2,
  Menu,
  Minus,
  PanelLeftClose,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { cn, shortPath } from '@/lib/utils'
import SubscriptionBadge from './SubscriptionBadge'

interface Props {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  onOpenSettings: () => void
}

const appWindow = getCurrentWindow()

export default function TitleBar({ sidebarCollapsed, onToggleSidebar, onOpenSettings }: Props) {
  const activeAccount = useAppStore((s) => s.activeAccount)
  const accounts = useAppStore((s) => s.accounts)
  const authStatus = useAppStore((s) => s.authStatus)
  const isRefreshingAuth = useAppStore((s) => s.isRefreshingAuth)
  const refreshAuth = useAppStore((s) => s.refreshAuth)
  const saveActive = useAppStore((s) => s.saveActive)

  const active = accounts.find((account) => account.name === activeAccount) ?? null
  const authPath = authStatus?.authPath ? shortPath(authStatus.authPath, 36) : 'auth.json'
  const authMatched = authStatus?.status === 'matched'

  const minimize = () => void appWindow.minimize()
  const toggleMaximize = () => void appWindow.toggleMaximize()
  const closeWindow = () => void appWindow.close()

  return (
    <header
      data-component="TitleBar"
      data-tauri-drag-region
      className="h-11 shrink-0 border-b border-line bg-bg-surface select-none grid grid-cols-[1fr_auto] items-center"
    >
      <div data-tauri-drag-region className="min-w-0 flex items-center gap-2 px-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? '展开侧边栏' : '缩小侧边栏'}
          className="w-7 h-7 flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-hover transition-colors shrink-0"
        >
          {sidebarCollapsed ? <Menu className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>

        <div data-tauri-drag-region className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-primary shrink-0" strokeWidth={1.8} />
          <span data-tauri-drag-region className="text-[13px] font-semibold text-fg shrink-0">
            Codex Switcher
          </span>
          {activeAccount && (
            <span
              data-tauri-drag-region
              className="max-w-[180px] truncate text-[11px] text-fg-muted bg-bg-elevated border border-line-subtle rounded-full px-2 py-0.5"
              title={activeAccount}
            >
              {activeAccount}
            </span>
          )}
          {active?.subscription && (
            <div className="shrink-0">
              <SubscriptionBadge plan={active.subscription.plan} displayName={active.subscription.displayName} />
            </div>
          )}
          <span
            data-tauri-drag-region
            title={authStatus?.authPath}
            className="hidden lg:inline truncate max-w-[260px] text-[11px] text-fg-subtle"
          >
            {authPath}
          </span>
          {authStatus && (
            <span
              data-tauri-drag-region
              className={cn(
                'hidden md:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                authMatched ? 'text-success bg-success-muted' : 'text-warning bg-warning-muted'
              )}
            >
              <CheckCircle2 className="w-3 h-3" />
              {authMatched ? '已匹配' : authStatus.status}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center h-full">
        <TitleButton
          title="刷新状态"
          onClick={() => void refreshAuth()}
          disabled={isRefreshingAuth}
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isRefreshingAuth && 'animate-spin')} />
        </TitleButton>
        <TitleButton title="保存当前账号状态" onClick={() => void saveActive()}>
          <Save className="w-3.5 h-3.5" />
        </TitleButton>
        <TitleButton title="设置" onClick={onOpenSettings}>
          <Settings className="w-3.5 h-3.5" />
        </TitleButton>

        <div className="mx-1 h-5 w-px bg-line" />

        <WindowButton title="最小化" onClick={minimize}>
          <Minus className="w-3.5 h-3.5" />
        </WindowButton>
        <WindowButton title="最大化或还原" onClick={toggleMaximize}>
          <Square className="w-3 h-3" />
        </WindowButton>
        <WindowButton title="关闭" onClick={closeWindow} danger>
          <X className="w-4 h-4" />
        </WindowButton>
      </div>
    </header>
  )
}

function TitleButton({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="w-8 h-8 flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-hover transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  )
}

function WindowButton({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        'w-11 h-11 flex items-center justify-center text-fg-muted transition-colors',
        danger ? 'hover:bg-danger hover:text-white' : 'hover:bg-bg-hover hover:text-fg'
      )}
    >
      {children}
    </button>
  )
}
