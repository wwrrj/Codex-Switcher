import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes?: number): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${min}`
}

export function formatTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function formatResetTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  if (diffMs <= 0) return '已重置'
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `${days} 天 ${hours % 24} 小时`
  }
  return `${hours} 小时 ${mins} 分`
}

export function percentageColor(pct?: number): { bar: string; text: string } {
  if (pct == null) return { bar: 'bg-fg-subtle/30', text: 'text-fg-muted' }
  if (pct >= 90) return { bar: 'bg-danger', text: 'text-danger' }
  if (pct >= 70) return { bar: 'bg-warning', text: 'text-warning' }
  return { bar: 'bg-primary', text: 'text-primary' }
}

export function validateAccountName(name: string): string | null {
  if (!name || name.length === 0) return '账号别名不能为空'
  if (name.length > 128) return '账号别名不能超过 128 个字符'
  if (/^\./.test(name)) return '不能以点开头'
  if (/\s/.test(name)) return '不能包含空格'
  if (name.includes('/') || name.includes('\\')) return '不能包含 / 或 \\'
  if (name.includes('..')) return '不能包含 ..'
  if (!/^[a-zA-Z0-9._@+-]+$/.test(name)) return '只能包含字母、数字、点、@、+、_、-'
  return null
}

/** 从邮箱或账号名中提取简短显示名：邮箱取 @ 前部分，否则直接返回 */
export function shortName(name: string, maxLen = 18): string {
  const at = name.indexOf('@')
  const local = at > 0 ? name.slice(0, at) : name
  if (local.length <= maxLen) return local
  return local.slice(0, maxLen - 1) + '…'
}
