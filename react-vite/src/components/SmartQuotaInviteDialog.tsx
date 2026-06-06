import { Sparkles, X } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { SchedulerMiniHeatmap } from './SmartQuotaSchedulerPanel'

interface Props {
  open: boolean
  onClose: () => void
  onOpenSettings: () => void
}

export default function SmartQuotaInviteDialog({ open, onClose, onOpenSettings }: Props) {
  const scheduler = useAppStore((state) => state.scheduler)
  const saveSchedulerConfig = useAppStore((state) => state.saveSchedulerConfig)
  const dismissSchedulerInvite = useAppStore((state) => state.dismissSchedulerInvite)
  const neverShowSchedulerInvite = useAppStore((state) => state.neverShowSchedulerInvite)

  if (!open) return null

  const recommendation = scheduler.analysis.recommendation
  if (!recommendation) return null

  const enableRecommended = async () => {
    await saveSchedulerConfig({
      ...scheduler.config,
      enabled: true,
      mode: 'recommended',
      invitePopupEnabled: true,
    })
    onClose()
  }

  const manual = () => {
    onClose()
    onOpenSettings()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" data-component="SmartQuotaInviteDialog">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative w-[720px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-48px)] overflow-y-auto rounded-2xl border border-line bg-bg-surface card-ring shadow-2xl p-5">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 w-7 h-7 rounded-md flex items-center justify-center text-fg-muted hover:text-fg hover:bg-bg-hover"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl border border-primary/25 bg-primary-muted flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-fg font-serif">发现可优化的 Codex 配额刷新时间</h2>
            <p className="text-xs text-fg-subtle mt-1 leading-relaxed">
              根据你的本地使用记录，建议每天 {recommendation.recommendedAnchorTime} 自动触发一次极小请求，使第一次刷新时间约为 {recommendation.expectedFirstRefreshTime}，从而更贴合你的编码时间。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 my-4">
          <Metric label="自动触发" value={recommendation.recommendedAnchorTime} />
          <Metric label="第一次刷新" value={recommendation.expectedFirstRefreshTime} />
          <Metric label="后续刷新" value={`${recommendation.expectedSecondRefreshTime} / ${recommendation.expectedThirdRefreshTime}`} />
          <Metric label="置信度" value={`${scheduler.analysis.maturity.confidenceScore}%`} />
        </div>

        <SchedulerMiniHeatmap buckets={scheduler.analysis.heatmap} />

        <div className="mt-4 rounded-xl border border-line-subtle bg-bg-elevated/50 p-3 space-y-2">
          <p className="text-xs text-fg-muted leading-relaxed">{recommendation.reason}</p>
          <p className="text-[11px] text-fg-subtle leading-relaxed">
            该功能不会增加额度，只会尝试优化 5 小时配额窗口起点。开启后每天最多自动触发一次极小请求；错过触发时间超过 30 分钟会跳过。
          </p>
          <p className="text-[11px] text-fg-subtle">
            已分析 {scheduler.analysis.maturity.activeUsageDays} 个活跃使用日，预计还需 {scheduler.analysis.maturity.remainingActiveDaysToOptimal} 个活跃使用日可获得更稳定的刷新时间优化。
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={() => void neverShowSchedulerInvite().then(onClose)}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-fg-muted hover:text-fg hover:bg-bg-hover"
          >
            不再提醒
          </button>
          <button
            onClick={() => void dismissSchedulerInvite(7).then(onClose)}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-fg-muted bg-bg-elevated hover:bg-bg-hover"
          >
            稍后提醒
          </button>
          <button
            onClick={manual}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-primary bg-primary-muted hover:bg-primary/15"
          >
            手动设置时间
          </button>
          <button
            onClick={() => void enableRecommended()}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-primary hover:bg-primary-hover"
          >
            开启无感优化
          </button>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg-elevated/60 border border-line-subtle px-2.5 py-2">
      <p className="text-[10px] text-fg-subtle">{label}</p>
      <p className="text-sm font-semibold text-fg tabular-nums mt-0.5">{value}</p>
    </div>
  )
}
