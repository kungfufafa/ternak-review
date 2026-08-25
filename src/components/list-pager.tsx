import { Button } from '#/components/ui/button'

export function ListPager({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
}: {
  page: number
  pageCount: number
  total: number
  pageSize: number
  onPage: (page: number) => void
}) {
  if (total === 0) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {from}–{to} dari {total}
      </p>
      {pageCount > 1 ? (
        <div className="flex gap-2">
          <Button
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            size="sm"
            type="button"
            variant="outline"
          >
            Sebelumnya
          </Button>
          <Button
            disabled={page >= pageCount}
            onClick={() => onPage(page + 1)}
            size="sm"
            type="button"
            variant="outline"
          >
            Berikutnya
          </Button>
        </div>
      ) : null}
    </div>
  )
}
