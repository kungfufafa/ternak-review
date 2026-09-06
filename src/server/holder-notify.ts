import { getAppUrl } from '#/lib/env'
import { isSmtpReady, sendAppEmail } from './smtp'
import { isWhatsappGatewayOpen, queueWhatsappOutbox } from './whatsapp'

export type NotifyChannelStatus = 'SENT' | 'QUEUED' | 'SKIPPED' | 'FAILED'

export type NotifyChannel = {
  channel: 'email' | 'whatsapp'
  status: NotifyChannelStatus
  reason?: string
}

export type HolderNotifyResult = {
  email: NotifyChannel
  whatsapp: NotifyChannel
}

function isPlaceholderEmail(email?: string | null) {
  const value = email?.trim().toLowerCase() ?? ''
  return !value || !value.includes('@') || value.endsWith('@wa.holder')
}

function pinMessage(input: {
  name?: string | null
  pin: string
  kind: 'WELCOME' | 'NOTICE'
}) {
  const hello = input.name?.trim() ? `Halo ${input.name.trim()},` : 'Halo,'
  const lead =
    input.kind === 'WELCOME'
      ? 'Akun Ternak Review sudah dibuat.'
      : 'PIN aktivasi Ternak Review sudah diganti.'
  const app = getAppUrl()
  return [
    hello,
    '',
    lead,
    `PIN aktivasi: ${input.pin}`,
    `Masuk: ${app}/login`,
    '',
    'Jangan bagikan PIN ini.',
  ].join('\n')
}

export async function getHolderNotifyStatus() {
  return {
    email: await isSmtpReady(),
    whatsapp: await isWhatsappGatewayOpen(),
  }
}

export async function notifyHolderCredentials(input: {
  name?: string | null
  email?: string | null
  whatsapp?: string | null
  pin: string
  kind: 'WELCOME' | 'NOTICE'
}): Promise<HolderNotifyResult> {
  const text = pinMessage(input)
  const email: NotifyChannel = { channel: 'email', status: 'SKIPPED' }
  const whatsapp: NotifyChannel = { channel: 'whatsapp', status: 'SKIPPED' }

  if (isPlaceholderEmail(input.email)) {
    email.reason = 'Tidak ada email asli.'
  } else if (!(await isSmtpReady())) {
    email.reason = 'Resend/SMTP belum aktif.'
  } else {
    try {
      await sendAppEmail({
        to: input.email!.trim().toLowerCase(),
        subject:
          input.kind === 'WELCOME'
            ? 'PIN akun Ternak Review'
            : 'PIN Ternak Review diganti',
        text,
        kind: input.kind === 'WELCOME' ? 'WELCOME' : 'NOTICE',
      })
      email.status = 'SENT'
    } catch (error) {
      email.status = 'FAILED'
      email.reason =
        error instanceof Error ? error.message : 'Gagal kirim email.'
    }
  }

  if (!input.whatsapp) {
    whatsapp.reason = 'Tidak ada nomor WhatsApp.'
  } else if (!(await isWhatsappGatewayOpen())) {
    whatsapp.reason = 'WhatsApp platform belum OPEN.'
  } else {
    try {
      await queueWhatsappOutbox({
        to: input.whatsapp,
        message: text,
        kind: 'NOTICE',
      })
      whatsapp.status = 'QUEUED'
    } catch (error) {
      whatsapp.status = 'FAILED'
      whatsapp.reason =
        error instanceof Error ? error.message : 'Gagal antre WhatsApp.'
    }
  }

  return { email, whatsapp }
}
