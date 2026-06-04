import { getCurrentWindow } from '@tauri-apps/api/window'
import { Menu, Minus, PanelLeftClose, Sparkles, Square, X } from 'lucide-react'

interface Props {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

export default function TopBar({ sidebarCollapsed, onToggleSidebar }: Props) {
  const appWindow = getCurrentWindow()

  return (
    <header
      data-component="TopBar"
      data-tauri-drag-region
      className="relative flex items-center h-11 px-3 border-b border-line bg-bg-surface shrink-0 select-none"
    >
      <div className="flex items-center gap-1.5 z-10">
        <button
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? '展开侧边栏' : '缩小侧边栏'}
          className="w-7 h-7 flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-hover transition-colors"
        >
          {sidebarCollapsed ? <Menu className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
        <Sparkles className="w-4 h-4 text-primary" strokeWidth={1.8} />
      </div>

      <span
        data-tauri-drag-region
        className="absolute inset-0 flex items-center justify-center pointer-events-none text-[13px] font-semibold text-fg-muted tracking-tight"
      >
        Codex — Account Switcher
      </span>

      <div className="ml-auto flex items-center z-10">
        <WindowButton label="最小化" onClick={() => void appWindow.minimize()}>
          <Minus className="w-3.5 h-3.5" />
        </WindowButton>
        <WindowButton label="最大化" onClick={() => void appWindow.toggleMaximize()}>
          <Square className="w-3 h-3" />
        </WindowButton>
        <WindowButton label="关闭" danger onClick={() => void appWindow.close()}>
          <X className="w-3.5 h-3.5" />
        </WindowButton>
      </div>
    </header>
  )
}

function WindowButton({ label, danger = false, onClick, children }: {
  label: string
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={danger
        ? 'w-10 h-8 flex items-center justify-center text-fg-muted hover:text-white hover:bg-danger transition-colors'
        : 'w-10 h-8 flex items-center justify-center text-fg-muted hover:text-fg hover:bg-bg-hover transition-colors'
      }
    >
      {children}
    </button>
  )
}
