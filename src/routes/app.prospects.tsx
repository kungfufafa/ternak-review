import { createFileRoute, stripSearchParams, useNavigate } from '@tanstack/react-router'
import { ProspectsScreen, searchSchema } from '#/routes/admin.prospects'
import { listProspectPlaceIdsFn, listProspectsFn } from '#/server/functions'

export const Route = createFileRoute('/app/prospects')({
  validateSearch: searchSchema,
  search: {
    middlewares: [stripSearchParams({ page: 1, sort: 'reviews' })],
  },
  loaderDeps: ({ search }) => ({
    q: search.q,
    stage: search.stage,
    install: search.install,
    partner: search.partner,
    sort: search.sort,
    page: search.page,
  }),
  loader: async ({ deps }) => {
    const [list, prospectPlaceIds] = await Promise.all([
      listProspectsFn({
        data: {
          q: deps.q,
          status: deps.stage,
          install: deps.install,
          partner: deps.partner,
          sort: deps.sort ?? (deps.install === 'due' ? 'pickup' : 'reviews'),
          page: deps.page ?? 1,
          pageSize: 20,
        },
      }),
      listProspectPlaceIdsFn(),
    ])
    return { list, prospectPlaceIds }
  },
  component: HolderProspectsPage,
  head: () => ({
    meta: [{ title: 'Prospek toko — Ternak Review' }],
  }),
})

function HolderProspectsPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/app/prospects' })
  return <ProspectsScreen {...data} search={search} navigate={navigate} />
}
