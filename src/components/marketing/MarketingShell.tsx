import type { ReactNode } from 'react'
import { useReveal } from '#/hooks/use-reveal'

export function MarketingShell({ children }: { children: ReactNode }) {
  useReveal()
  return <div className="tr-root">{children}</div>
}
