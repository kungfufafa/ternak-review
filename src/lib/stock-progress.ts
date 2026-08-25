export type BatchNextStep = 'print' | 'nfc' | 'ready'

export function batchNextStep(batch: {
  remaining: number
  encoded: number
}): BatchNextStep {
  if (batch.remaining <= 0 || batch.encoded >= batch.remaining) return 'ready'
  if (batch.encoded > 0) return 'nfc'
  return 'print'
}
