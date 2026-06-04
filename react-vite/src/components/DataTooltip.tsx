import { useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface Props {
  children: ReactNode
  content: ReactNode
  className?: string
}

interface Position {
  x: number
  y: number
}

function tooltipPosition(event: MouseEvent): Position {
  const width = 248
  const height = 132
  const gap = 14
  const x = event.clientX + width + gap > window.innerWidth
    ? event.clientX - width - gap
    : event.clientX + gap
  const y = event.clientY + height + gap > window.innerHeight
    ? event.clientY - height - gap
    : event.clientY + gap
  return { x: Math.max(8, x), y: Math.max(8, y) }
}

export default function DataTooltip({ children, content, className }: Props) {
  const [position, setPosition] = useState<Position | null>(null)

  const handleMove = (event: MouseEvent) => setPosition(tooltipPosition(event))

  return (
    <>
      <div
        className={cn('cursor-default', className)}
        onMouseEnter={handleMove}
        onMouseMove={handleMove}
        onMouseLeave={() => setPosition(null)}
      >
        {children}
      </div>
      {position && createPortal(
        <div
          data-component="DataTooltip"
          className="fixed z-[100] pointer-events-none w-[240px] rounded-lg border border-line bg-bg-surface/95 backdrop-blur-md card-ring px-3 py-2.5 shadow-xl"
          style={{ left: position.x, top: position.y }}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  )
}
