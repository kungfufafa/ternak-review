import {
  getRequestHeader,
  getRequestIP,
} from '@tanstack/react-start/server'
import { getDeployTarget } from '#/lib/deploy-target'
import { hashToken } from '#/lib/crypto'
import { isTrustedProxyEnabled } from '#/lib/env'

function header(name: string) {
  try {
    return getRequestHeader(name)?.trim() || null
  } catch {
    return null
  }
}

function validIpLike(value: string | null) {
  if (!value || value.length > 64 || /[\r\n]/.test(value)) return null
  return value
}

export function getTrustedClientIp() {
  if (getDeployTarget() === 'cloudflare') {
    return validIpLike(header('cf-connecting-ip'))
  }

  if (isTrustedProxyEnabled()) {
    const realIp = validIpLike(header('x-real-ip'))
    if (realIp) return realIp
    const forwarded = header('x-forwarded-for')
    const trustedForwarded = validIpLike(
      forwarded?.split(',').at(-1)?.trim() ?? null,
    )
    if (trustedForwarded) return trustedForwarded
  }

  try {
    return validIpLike(getRequestIP() ?? null)
  } catch {
    return null
  }
}

export function getClientFingerprint() {
  const ip = getTrustedClientIp()
  if (ip) return `ip:${hashToken(ip).slice(0, 32)}`

  const userAgent = header('user-agent')?.slice(0, 256) ?? 'unknown-agent'
  const language = header('accept-language')?.slice(0, 128) ?? 'unknown-lang'
  return `client:${hashToken(`${userAgent}:${language}`).slice(0, 32)}`
}

export function hashRateLimitIdentifier(value: string) {
  return hashToken(value.trim().toLowerCase()).slice(0, 32)
}
