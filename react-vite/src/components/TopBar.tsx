import { Menu, PanelLeftClose, Sparkles } from 'lucide-react'

interface Props {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

export default function TopBar({ sidebarCollapsed, onToggleSidebar }: Props) {
  return (
    <header
      data-component="TopBar"
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

      <span className="absolute inset-0 flex items-center justify-center pointer-events-none text-[13px] font-semibold text-fg-muted tracking-tight">
        Codex — Account Switcher
      </span>
    </header>
  )
}
