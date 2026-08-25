import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Wordmark } from '#/components/marketing/Wordmark'
import { cn } from '#/lib/utils'

export function AuthShell({
  children,
  action,
  wide,
  center,
}: {
  children: ReactNode
  action?: ReactNode
  wide?: boolean
  center?: boolean
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <div className="brand-stripe" />
      <header className="flex h-14 shrink-0 items-center justify-between bg-background/80 px-4 backdrop-blur-[18px] md:px-6">
        <Link className="no-underline" to="/">
          <Wordmark />
        </Link>
        {action ?? (
          <Link
            className="text-sm text-muted-foreground no-underline hover:text-foreground"
            to="/"
          >
            Beranda
          </Link>
        )}
      </header>
      <main
        className={cn(
          'mx-auto flex w-full flex-1 flex-col px-4 py-10 md:px-6 md:py-16',
          wide ? 'max-w-lg' : 'max-w-md',
          center && 'items-center justify-center text-center',
        )}
      >
        <div className={cn('flex w-full flex-col gap-8', center && 'items-center')}>
          {children}
        </div>
      </main>
    </div>
  )
}

export function AuthTitle({
  title,
  description,
}: {
  title: ReactNode
  description?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-normal tracking-tight sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="max-w-lg text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}
