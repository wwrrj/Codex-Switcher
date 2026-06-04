import { X, Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'

export default function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts)
  const removeToast = useAppStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  const icon = (level: string) => {
    switch (level) {
      case 'success': return <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
      case 'warning': return <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
      case 'error': return <XCircle className="w-4 h-4 text-danger shrink-0" />
      default: return <Info className="w-4 h-4 text-primary shrink-0" />
    }
  }

  return (
    <div
      data-component="ToastContainer"
      className="fixed top-3 right-3 z-[60] flex flex-col gap-2 max-w-[360px]"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-start gap-2 px-3 py-2.5 rounded-lg border card-ring text-xs',
            'bg-bg-surface',
            t.level === 'error' && 'border-danger/30',
            t.level === 'warning' && 'border-warning/30',
            t.level === 'success' && 'border-success/30',
            t.level === 'info' && 'border-line'
          )}
        >
          {icon(t.level)}
          <span className="flex-1 text-fg leading-relaxed">{t.message}</span>
          <button
            onClick={() => removeToast(t.id)}
            className="shrink-0 text-fg-subtle hover:text-fg"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
