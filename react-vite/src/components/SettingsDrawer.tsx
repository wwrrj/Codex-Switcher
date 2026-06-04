import { useState, useEffect } from 'react'
import { X, RotateCcw } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import type { AppSettings } from '@/lib/types'

const defaultSettings: AppSettings = {
  autoDetectCodexHome: true,
  refreshUsageOnStartup: true,
  refreshUsageAfterSwitch: true,
  restorePreviousAfterUsageCheck: true,
  backupRetention: 10,
  enableUsageQuery: true,
  theme: 'dark',
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function SettingsDrawer({ open, onClose }: Props) {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [form, setForm] = useState<AppSettings>(settings)

  useEffect(() => {
    if (open) setForm(settings)
  }, [open, settings])

  useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  const handleSave = async () => {
    await updateSettings(form)
    onClose()
  }

  const handleReset = () => {
    setForm({ ...defaultSettings })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-component="SettingsDrawer">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-[380px] max-w-full h-full bg-bg-surface border-l border-line card-ring flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-line shrink-0">
          <h2 className="text-lg font-semibold text-fg tracking-tight font-serif">设置</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-hover"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Codex Home */}
          <FieldGroup label="Codex Home 路径">
            <input
              type="text"
              value={form.codexHome ?? ''}
              onChange={(e) => setForm({ ...form, codexHome: e.target.value || undefined })}
              placeholder="自动检测"
              className="w-full px-2.5 py-1.5 rounded-md text-xs bg-bg border border-line text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none"
            />
          </FieldGroup>

          {/* Toggles */}
          <FieldGroup label="功能开关">
            <ToggleRow
              label="自动检测 CODEX_HOME"
              checked={form.autoDetectCodexHome}
              onChange={(v) => setForm({ ...form, autoDetectCodexHome: v })}
            />
            <ToggleRow
              label="启动时自动刷新当前账号用量"
              checked={form.refreshUsageOnStartup}
              onChange={(v) => setForm({ ...form, refreshUsageOnStartup: v })}
            />
            <ToggleRow
              label="切换账号后自动刷新用量"
              checked={form.refreshUsageAfterSwitch}
              onChange={(v) => setForm({ ...form, refreshUsageAfterSwitch: v })}
            />
            <ToggleRow
              label="查询非当前账号用量后自动切回"
              checked={form.restorePreviousAfterUsageCheck}
              onChange={(v) => setForm({ ...form, restorePreviousAfterUsageCheck: v })}
            />
            <ToggleRow
              label="启用用量查询（实验功能）"
              checked={form.enableUsageQuery}
              onChange={(v) => setForm({ ...form, enableUsageQuery: v })}
            />
          </FieldGroup>

          {/* Backup retention */}
          <FieldGroup label="备份保留数量">
            <input
              type="number"
              min={1}
              max={100}
              value={form.backupRetention}
              onChange={(e) => setForm({ ...form, backupRetention: parseInt(e.target.value) || 10 })}
              className="w-20 px-2.5 py-1.5 rounded-md text-xs bg-bg border border-line text-fg focus:border-primary focus:outline-none"
            />
          </FieldGroup>

          {/* Theme */}
          <FieldGroup label="主题">
            <div className="flex gap-1.5">
              {(['system', 'light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, theme: t })}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    form.theme === t
                      ? 'bg-primary text-white'
                      : 'bg-bg-elevated text-fg-muted hover:bg-bg-hover'
                  )}
                >
                  {t === 'system' ? '跟随系统' : t === 'light' ? '浅色' : '深色'}
                </button>
              ))}
            </div>
          </FieldGroup>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-line shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-fg-muted hover:text-fg hover:bg-bg-hover transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            重置默认
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-md text-xs font-medium text-white bg-primary hover:bg-primary-hover transition-colors"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-fg-muted mb-2">{label}</label>
      {children}
    </div>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-fg">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          'relative w-8 h-[18px] rounded-full transition-colors shrink-0',
          checked ? 'bg-primary' : 'bg-bg-elevated border border-line'
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-[16px]' : 'translate-x-[2px]'
          )}
        />
      </button>
    </div>
  )
}
