import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import type { SubscriptionPlan } from '@/lib/types'
import { cn } from '@/lib/utils'

const planOptions: { value: SubscriptionPlan | 'auto'; label: string }[] = [
  { value: 'auto', label: '自动识别' },
  { value: 'free', label: 'Free' },
  { value: 'go', label: 'Go' },
  { value: 'plus', label: 'Plus' },
  { value: 'pro', label: 'Pro' },
  { value: 'pro_lite', label: 'Pro Lite' },
  { value: 'team', label: 'Team' },
  { value: 'business', label: 'Business' },
  { value: 'enterprise', label: 'Enterprise' },
  { value: 'edu', label: 'Edu' },
  { value: 'api_key', label: 'API Key' },
  { value: 'unknown', label: 'Unknown' },
]

export default function SetSubscriptionDialog() {
  const target = useAppStore((s) => s.subscriptionOverrideTarget)
  const accounts = useAppStore((s) => s.accounts)
  const close = useAppStore((s) => s.closeSubscriptionOverrideDialog)
  const setOverride = useAppStore((s) => s.setSubscriptionOverride)
  const clearOverride = useAppStore((s) => s.clearSubscriptionOverride)

  const account = target ? accounts.find((a) => a.name === target) : null
  const currentOverride = account?.manualSubscriptionOverride

  const [selected, setSelected] = useState<SubscriptionPlan | 'auto'>(
    currentOverride ?? 'auto'
  )

  useEffect(() => {
    if (target && account) {
      setSelected(account.manualSubscriptionOverride ?? 'auto')
    }
  }, [target, account])

  useEffect(() => {
    if (!target) return
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [target, close])

  if (!target || !account) return null

  const handleSave = async () => {
    if (selected === 'auto') {
      if (currentOverride) await clearOverride(account.name)
      else close()
    } else {
      await setOverride(account.name, selected)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-component="SetSubscriptionDialog">
      <div className="absolute inset-0 bg-black/40" onClick={close} />
      <div className="relative w-[380px] max-w-[90vw] bg-bg-surface border border-line rounded-lg card-ring">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="text-sm font-semibold text-fg font-serif">手动设置订阅类型</h3>
          <button onClick={close} className="w-6 h-6 flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-hover">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-fg-muted">
            此设置只影响本工具显示，不会修改 Codex auth.json。
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {planOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelected(opt.value)}
                className={cn(
                  'px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                  selected === opt.value
                    ? 'bg-primary text-white'
                    : 'bg-bg-elevated text-fg-muted hover:bg-bg-hover'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-line">
          <button
            onClick={close}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-fg-muted bg-bg-elevated hover:bg-bg-hover transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-primary hover:bg-primary-hover transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
