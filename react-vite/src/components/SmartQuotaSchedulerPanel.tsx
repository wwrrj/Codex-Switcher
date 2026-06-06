import { Info, PauseCircle, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import type { SchedulerConfig, SchedulerHeatmapBucket } from '@/lib/types'

function addHours(time: string | undefined, hours: number): string {
  if (!time) return '—'
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '—'
  const total = (h * 60 + m + hours * 60) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function maturityText(activeDays: number, confidence: number, remaining: number, calendarDays: number): string {
  if (activeDays < 3) {
    return `正在学习你的 Codex 使用习惯。当前已分析 ${activeDays} 个活跃使用日，预计还需要约 ${remaining} 个活跃使用日才能得到更稳定的刷新时间优化。你也可以手动设置触发时间。`
  }
  if (activeDays < 7) {
    return `当前推荐为临时估计。已分析 ${activeDays} 个活跃使用日，推荐置信度 ${confidence}%。预计还需要约 ${remaining} 个活跃使用日，或按你当前频率约 ${calendarDays} 个自然日，可获得更稳定的刷新时间优化。`
  }
  return `已根据 ${activeDays} 个活跃使用日生成推荐，当前置信度 ${confidence}%。推荐结果会随本地使用数据增加而变化。`
}

export default function SmartQuotaSchedulerPanel() {
  const scheduler = useAppStore((state) => state.scheduler)
  const saveSchedulerConfig = useAppStore((state) => state.saveSchedulerConfig)
  const refreshScheduler = useAppStore((state) => state.refreshScheduler)
  const [showInfo, setShowInfo] = useState(false)

  const config = scheduler.config
  const analysis = scheduler.analysis
  const recommendation = analysis.recommendation
  const anchor = config.mode === 'manual'
    ? config.manualAnchorTime
    : recommendation?.recommendedAnchorTime
  const firstRefresh = recommendation?.expectedFirstRefreshTime ?? addHours(anchor, 5)
  const secondRefresh = recommendation?.expectedSecondRefreshTime ?? addHours(anchor, 10)
  const thirdRefresh = recommendation?.expectedThirdRefreshTime ?? addHours(anchor, 15)

  const updateConfig = (patch: Partial<SchedulerConfig>) => {
    void saveSchedulerConfig({ ...config, ...patch })
  }

  const maturity = analysis.maturity
  const statusText = config.enabled
    ? `智能配额调度已开启。今天预计 ${anchor ?? '—'} 自动触发，第一次刷新约为 ${firstRefresh}。`
    : maturityText(
        maturity.activeUsageDays,
        maturity.confidenceScore,
        maturity.remainingActiveDaysToOptimal,
        maturity.estimatedCalendarDaysToOptimal,
      )

  return (
    <div data-component="SmartQuotaSchedulerPanel" className="rounded-xl border border-line bg-bg p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-semibold text-fg">智能配额调度</h3>
            <span
              className="relative"
              onMouseEnter={() => setShowInfo(true)}
              onMouseLeave={() => setShowInfo(false)}
            >
              <Info className="w-3.5 h-3.5 text-fg-subtle cursor-help" />
              {showInfo && <SchedulerInfoPopover />}
            </span>
          </div>
          <p className="text-[11px] text-fg-subtle mt-1 leading-relaxed">
            基于本地日志优化 5 小时配额窗口起点。不会增加额度，开启后每天最多自动触发一次极小请求。
          </p>
        </div>
        <Toggle
          checked={config.enabled}
          onChange={(enabled) => updateConfig({ enabled })}
        />
      </div>

      <div className="rounded-lg border border-line-subtle bg-bg-elevated/50 p-2.5">
        <p className="text-[11px] text-fg-muted leading-relaxed">{statusText}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="推荐触发" value={recommendation?.recommendedAnchorTime ?? '—'} />
        <Metric label="第一次刷新" value={firstRefresh} />
        <Metric label="后续刷新" value={`${secondRefresh} / ${thirdRefresh}`} />
        <Metric label="置信度" value={`${maturity.confidenceScore}%`} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-fg-muted">本地被动分析</span>
          <Toggle
            checked={config.passiveAnalysisEnabled}
            onChange={(passiveAnalysisEnabled) => updateConfig({ passiveAnalysisEnabled })}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-fg-muted">弹窗邀请</span>
          <Toggle
            checked={config.invitePopupEnabled}
            onChange={(invitePopupEnabled) => updateConfig({ invitePopupEnabled })}
          />
        </div>
      </div>

      <div>
        <p className="text-[11px] text-fg-muted mb-1.5">模式</p>
        <div className="grid grid-cols-2 gap-1.5">
          <Choice
            active={config.mode === 'recommended'}
            label="自动推荐时间"
            onClick={() => updateConfig({ mode: 'recommended' })}
          />
          <Choice
            active={config.mode === 'manual'}
            label="手动设定时间"
            onClick={() => updateConfig({ mode: 'manual' })}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="time"
          value={config.manualAnchorTime ?? recommendation?.recommendedAnchorTime ?? '08:30'}
          onChange={(event) => updateConfig({ mode: 'manual', manualAnchorTime: event.target.value })}
          className="px-2.5 py-1.5 rounded-md text-xs bg-bg-elevated border border-line text-fg focus:border-primary focus:outline-none"
        />
        <span className="text-[10px] text-fg-subtle">手动触发时间，精确到分钟</span>
      </div>

      <div>
        <p className="text-[11px] text-fg-muted mb-1.5">账号范围</p>
        <div className="grid grid-cols-2 gap-1.5">
          <Choice
            active={config.accountScope === 'current'}
            label="当前账号"
            onClick={() => updateConfig({ accountScope: 'current' })}
          />
          <Choice
            active={config.accountScope === 'all_enabled'}
            label="所有已启用账号"
            onClick={() => updateConfig({ accountScope: 'all_enabled' })}
          />
        </div>
      </div>

      <div className="rounded-lg border border-line-subtle bg-bg-elevated/40 p-2.5 space-y-1">
        <p className="text-[11px] font-medium text-fg-muted">数据成熟度</p>
        <p className="text-[10px] text-fg-subtle leading-relaxed">
          当前已分析 {maturity.activeUsageDays} 个活跃使用日、{maturity.totalSessions} 个会话、{maturity.totalRequests} 次请求。
          距离更稳定推荐还需约 {maturity.remainingActiveDaysToOptimal} 个活跃使用日，按当前频率约 {maturity.estimatedCalendarDaysToOptimal} 个自然日。
        </p>
      </div>

      {scheduler.history.length > 0 && (
        <div className="rounded-lg border border-line-subtle bg-bg-elevated/40 p-2.5 space-y-1.5">
          <p className="text-[11px] font-medium text-fg-muted">最近调度</p>
          {scheduler.history.slice(0, 3).map((entry) => (
            <div key={entry.id} className="flex items-center gap-2 text-[10px] text-fg-subtle">
              <span className={cn('w-1.5 h-1.5 rounded-full', entry.resultStatus === 'success' ? 'bg-success' : 'bg-warning')} />
              <span className="truncate">{entry.date} · {entry.finalAnchorTime}</span>
              <span className="ml-auto">{entry.resultStatus}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => void refreshScheduler()}
          className="px-2.5 py-1.5 rounded-md text-[11px] font-medium text-primary bg-primary-muted hover:bg-primary/15 transition-colors"
        >
          重新分析
        </button>
        {config.enabled && (
          <span className="inline-flex items-center gap-1 text-[10px] text-fg-subtle">
            <PauseCircle className="w-3 h-3" />
            连续失败或无收益时会自动暂停
          </span>
        )}
      </div>
    </div>
  )
}

function SchedulerInfoPopover() {
  const analysis = useAppStore((state) => state.scheduler.analysis)
  const recommendation = analysis.recommendation
  return (
    <div className="absolute left-0 top-5 z-[80] w-[520px] rounded-xl border border-line bg-bg-surface card-ring shadow-2xl p-4">
      <div className="flex items-start gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-primary mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-fg font-serif">智能配额调度如何工作</p>
          <p className="text-[11px] text-fg-subtle mt-1 leading-relaxed">
            该功能用于优化 Codex 5 小时配额窗口的起点。它不会增加你的额度，而是根据你的本地使用习惯，选择一个更适合的首次触发时间。
          </p>
        </div>
      </div>
      <SchedulerMiniHeatmap buckets={analysis.heatmap} />
      <div className="grid grid-cols-4 gap-2 my-3">
        <Metric label="活跃日" value={`${analysis.maturity.activeUsageDays}`} />
        <Metric label="会话" value={`${analysis.maturity.totalSessions}`} />
        <Metric label="置信度" value={`${analysis.maturity.confidenceScore}%`} />
        <Metric label="还需活跃日" value={`${analysis.maturity.remainingActiveDaysToOptimal}`} />
      </div>
      <div className="space-y-2 text-[11px] text-fg-subtle leading-relaxed">
        <p>系统会在本地分析 Codex 使用日志，识别你通常在哪些时间段高强度写代码，然后模拟不同首次使用时间，计算 5 小时、10 小时、15 小时后的刷新点。</p>
        <p>开启后，应用会在该时间自动发送一次极小请求，用于启动当天的 5 小时窗口。每个账号每天最多触发一次，错过 30 分钟会跳过。</p>
        {analysis.maturity.activeUsageDays < 7 && (
          <p className="text-warning">当前数据还不足以得到稳定结论，系统会使用目前已知数据进行临时估计。你也可以手动设定触发时间。</p>
        )}
        {recommendation && <p className="text-fg-muted">{recommendation.reason}</p>}
      </div>
    </div>
  )
}

export function SchedulerMiniHeatmap({ buckets }: { buckets: SchedulerHeatmapBucket[] }) {
  const recentDays = useMemo(() => {
    const days = Array.from(new Set(buckets.map((bucket) => bucket.day))).sort().slice(-30)
    return days
  }, [buckets])
  const byKey = useMemo(() => {
    const map = new Map<string, SchedulerHeatmapBucket>()
    for (const bucket of buckets) map.set(`${bucket.day}:${bucket.minuteOfDay}`, bucket)
    return map
  }, [buckets])
  const slots = Array.from({ length: 48 }, (_, index) => index * 30)
  const displayMax = useMemo(() => {
    const daySet = new Set(recentDays)
    return buckets
      .filter((bucket) => daySet.has(bucket.day))
      .reduce((max, bucket) => Math.max(max, bucket.intensity), 0)
  }, [buckets, recentDays])

  if (recentDays.length === 0) {
    return (
      <div className="rounded-lg border border-line-subtle bg-bg-elevated/40 p-3 text-[11px] text-fg-subtle">
        暂无足够本地日志，当前仅能给出临时估计。
      </div>
    )
  }

  return (
    <div>
      <div className="space-y-1">
        {recentDays.map((day) => (
          <div key={day} className="flex items-center gap-1">
            <span className="w-12 text-[9px] text-fg-subtle">{day.slice(5)}</span>
            <div
              className="grid gap-[2px] flex-1"
              style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}
            >
              {slots.map((minute) => {
                const b0 = byKey.get(`${day}:${minute}`)
                const b1 = byKey.get(`${day}:${minute + 15}`)
                const rawIntensity = Math.max(b0?.intensity ?? 0, b1?.intensity ?? 0)
                const hasData = Boolean(b0 || b1)
                const intensity = displayMax > 0 ? rawIntensity / displayMax : 0
                return (
                  <span
                    key={minute}
                    title={`${day} ${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`}
                    className="h-2 rounded-[2px] border"
                    style={{
                      backgroundColor: hasData
                        ? `hsl(var(--primary) / ${0.18 + intensity * 0.82})`
                        : 'hsl(var(--bg-elevated) / 0.35)',
                      borderColor: hasData
                        ? `hsl(var(--primary) / ${0.22 + intensity * 0.5})`
                        : 'hsl(var(--line-subtle) / 0.5)',
                    }}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between pl-14 mt-1 text-[9px] text-fg-subtle">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg-elevated/60 border border-line-subtle px-2 py-1.5">
      <p className="text-[9px] text-fg-subtle">{label}</p>
      <p className="text-xs font-semibold text-fg tabular-nums mt-0.5">{value}</p>
    </div>
  )
}

function Choice({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors',
        active ? 'bg-primary text-white' : 'bg-bg-elevated text-fg-muted hover:bg-bg-hover'
      )}
    >
      {label}
    </button>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-[42px] h-6 rounded-full transition-colors shrink-0',
        checked ? 'bg-primary' : 'bg-bg-elevated border border-line'
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform',
          checked && 'translate-x-[18px]'
        )}
      />
    </button>
  )
}
