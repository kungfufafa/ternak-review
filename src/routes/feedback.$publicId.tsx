import { createFileRoute, redirect } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { StarIcon } from 'lucide-react'
import { useState } from 'react'
import { AuthShell, AuthTitle } from '#/components/auth-shell'
import { Alert } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import { Spinner } from '#/components/ui/spinner'
import { Textarea } from '#/components/ui/textarea'
import {
  getFeedbackCardFn,
  resolveFeedbackDestinationFn,
  submitAnonymousFeedbackFn,
} from '#/server/functions'

export const Route = createFileRoute('/feedback/$publicId')({
  loader: async ({ params }) => {
    const card = await getFeedbackCardFn({ data: { publicId: params.publicId } })
    if (!card) throw redirect({ href: `/r/${params.publicId}` })
    return { card }
  },
  component: FeedbackPage,
  head: () => ({
    meta: [{ title: 'Bagaimana pengalamanmu? — Ternak Review' }],
  }),
})

function FeedbackPage() {
  const { card } = Route.useLoaderData()
  const resolveFn = useServerFn(resolveFeedbackDestinationFn)
  const submitFn = useServerFn(submitAnonymousFeedbackFn)
  const [rating, setRating] = useState<number | null>(null)
  const [anonymousRating, setAnonymousRating] = useState<number | null>(null)
  const [ownerChatUrl, setOwnerChatUrl] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const showAnonymousForm = anonymousRating !== null && !submitted

  async function chooseRating(nextRating: number) {
    setRating(nextRating)
    setAnonymousRating(null)
    setOwnerChatUrl(null)
    setError(null)
    setSubmitted(false)
    setBusy(true)
    try {
      const result = await resolveFn({
        data: { publicId: card.publicId, rating: nextRating },
      })
      if (result.kind === 'anonymous') {
        setAnonymousRating(nextRating)
        return
      }
      // A low rating is an offer to talk to the owner, never a gate: the
      // guest still gets Google Review as an equal choice.
      if (result.kind === 'owner_whatsapp') {
        setOwnerChatUrl(result.url)
        return
      }
      window.location.assign(result.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyiapkan jalur review.')
    } finally {
      setBusy(false)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!rating || rating !== anonymousRating || busy) return
    setError(null)
    setBusy(true)
    try {
      await submitFn({
        data: {
          publicId: card.publicId,
          rating,
          message,
          submissionId: crypto.randomUUID(),
        },
      })
      setSubmitted(true)
      setMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Masukan gagal disimpan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell center wide>
      <AuthTitle
        title={
          <>
            Bagaimana pengalamanmu di{' '}
            <em className="text-pine italic">{card.outletName}</em>?
          </>
        }
        description="Pilih rating sesuai pengalamanmu."
      />
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {submitted ? (
        <Alert variant="success">
          Masukan tersimpan. Sistem akan meneruskannya ke pemilik toko saat
          WhatsApp tersambung.
        </Alert>
      ) : null}
      <Card className="w-full">
        <CardContent className="flex flex-col gap-5 p-6">
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <Button
                aria-label={`Beri rating ${value} dari 5`}
                aria-pressed={rating === value}
                className="h-14 flex-col rounded-2xl px-1"
                disabled={busy}
                key={value}
                onClick={() => void chooseRating(value)}
                type="button"
                variant={rating === value ? 'default' : 'outline'}
              >
                <StarIcon className={rating === value ? 'fill-current' : undefined} />
                <span className="text-xs">{value}</span>
              </Button>
            ))}
          </div>
          {busy ? <Spinner className="self-center" /> : null}
          {ownerChatUrl ? (
            <div className="flex flex-col gap-3">
              <p className="text-center text-sm text-muted-foreground">
                Sampaikan langsung ke pemilik toko, atau tulis review di Google.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button asChild variant="outline">
                  <a href={ownerChatUrl} rel="noreferrer">
                    Chat pemilik via WhatsApp
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={card.googleReviewUrl} rel="noreferrer">
                    Tulis review di Google
                  </a>
                </Button>
              </div>
            </div>
          ) : null}
          {showAnonymousForm ? (
            <form className="flex flex-col gap-3" onSubmit={submit}>
              <label className="text-sm font-medium" htmlFor="feedback-message">
                Ceritakan pengalamanmu
              </label>
              <Textarea
                id="feedback-message"
                maxLength={2000}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Tulis masukanmu di sini…"
                required
                value={message}
              />
              <p className="text-right text-xs text-muted-foreground">
                {message.length}/2.000
              </p>
              <Button disabled={busy || message.trim().length === 0} type="submit">
                Kirim masukan anonim
              </Button>
            </form>
          ) : null}
          {submitted ? (
            <p className="text-center text-sm text-muted-foreground">
              Terima kasih sudah membantu toko memperbaiki layanan.
            </p>
          ) : null}
          {ownerChatUrl ? null : (
            <Button
              asChild
              className={showAnonymousForm ? 'w-full' : 'self-center'}
              variant={showAnonymousForm ? 'outline' : 'link'}
            >
              <a href={card.googleReviewUrl} rel="noreferrer">
                Tulis review di Google
              </a>
            </Button>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  )
}
