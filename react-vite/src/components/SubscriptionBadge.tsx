import type { SubscriptionPlan } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  plan?: SubscriptionPlan
  displayName?: string
  className?: string
  size?: 'sm' | 'md'
}

const planStyles: Record<SubscriptionPlan, string> = {
  free: 'bg-fg-subtle/15 text-fg-muted',
  go: 'bg-cyan-500/15 text-cyan-400',
  plus: 'bg-primary-muted text-primary',
  pro: 'bg-accent-muted text-accent',
  pro_lite: 'bg-accent-muted/60 text-accent/80',
  team: 'bg-success-muted text-success',
  business: 'bg-success-muted/80 text-success/90',
  enterprise: 'bg-amber-500/15 text-amber-400',
  edu: 'bg-teal-500/15 text-teal-400',
  api_key: 'bg-warning-muted text-warning',
  unknown: 'bg-fg-subtle/10 text-fg-subtle border border-dashed border-fg-subtle/30',
}

const planLabel: Record<SubscriptionPlan, string> = {
  free: 'Free',
  go: 'Go',
  plus: 'Plus',
  pro: 'Pro',
  pro_lite: 'Pro Lite',
  team: 'Team',
  business: 'Business',
  enterprise: 'Enterprise',
  edu: 'Edu',
  api_key: 'API Key',
  unknown: 'Unknown',
}

export default function SubscriptionBadge({ plan, displayName, className, size = 'sm' }: Props) {
  const p = plan ?? 'unknown'
  const label = displayName ?? planLabel[p]
  const style = planStyles[p]

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
        style,
        className
      )}
    >
      {label}
    </span>
  )
}
