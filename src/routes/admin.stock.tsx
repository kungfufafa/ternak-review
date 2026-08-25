import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/stock')({
  component: StockLayout,
})

function StockLayout() {
  return <Outlet />
}
