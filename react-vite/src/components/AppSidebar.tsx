import { BarChart3, Settings, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AppPage = 'accounts' | 'analytics'

interface Props {
  collapsed: boolean
  page: AppPage
  onPageChange: (page: AppPage) => void
  onOpenSettings: () => void
}

export default function AppSidebar({ collapsed, page, onPageChange, onOpenSettings }: Props) {
  return (
    <aside
      data-component="AppSidebar"
      className={cn(
        'shrink-0 border-r border-line bg-bg-surface flex flex-col transition-[width] duration-200 overflow-hidden',
        collapsed ? 'w-[58px]' : 'w-[220px]'
      )}
    >
      <nav className="flex-1 p-2 space-y-1">
        <NavButton
          collapsed={collapsed}
          active={page === 'accounts'}
          icon={<Users className="w-4 h-4" />}
          label="账号管理"
          onClick={() => onPageChange('accounts')}
        />
        <NavButton
          collapsed={collapsed}
          active={page === 'analytics'}
          icon={<BarChart3 className="w-4 h-4" />}
          label="用量分析"
          onClick={() => onPageChange('analytics')}
        />
      </nav>

      <div className="p-2 border-t border-line-subtle">
        <NavButton
          collapsed={collapsed}
          active={false}
          icon={<Settings className="w-4 h-4" />}
          label="设置"
          onClick={onOpenSettings}
        />
      </div>
    </aside>
  )
}

function NavButton({ collapsed, active, icon, label, onClick }: {
  collapsed: boolean
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        'w-full h-9 flex items-center rounded-md text-xs font-medium transition-colors',
        collapsed ? 'justify-center' : 'px-3 gap-2.5',
        active
          ? 'bg-primary-muted text-primary'
          : 'text-fg-muted hover:text-fg hover:bg-bg-hover'
      )}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span>{label}</span>}
    </button>
  )
}
