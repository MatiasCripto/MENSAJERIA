'use client'

import { cn } from '@/lib/utils/cn'
import { HTMLAttributes, ReactNode } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  children: ReactNode
}

const variants: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-zinc-300',
  success: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400',
  danger: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400',
}

function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

Badge.displayName = 'Badge'

export { Badge }
export type { BadgeVariant, BadgeProps }
