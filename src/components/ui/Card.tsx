'use client'

import { cn } from '@/lib/utils/cn'
import { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
}

function Card({ title, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 bg-white shadow-sm',
        className,
      )}
      {...props}
    >
      {title && (
        <div className="border-b border-gray-200 px-4 py-3">
          {typeof title === 'string' ? (
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          ) : (
            title
          )}
        </div>
      )}
      <div className="px-4 py-4">{children}</div>
    </div>
  )
}

Card.displayName = 'Card'

export { Card }
export type { CardProps }
