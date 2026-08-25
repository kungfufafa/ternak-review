import { useServerFn } from '@tanstack/react-start'
import { useMemo, useState, type FormEvent } from 'react'
import { affiliatePlatforms } from '#/components/marketing/affiliate/content'
import {
  CheckIcon,
  FacebookIcon,
  InstagramIcon,
  ThreadsIcon,
  TikTokIcon,
  XIcon,
  YouTubeIcon,
} from '#/components/marketing/icons'
import { submitAffiliateLeadFn } from '#/server/functions'
import type {
  AffiliateFieldErrors,
  AffiliatePlatformKey,
} from '#/types/marketing'

const platformIcons = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  youtube: YouTubeIcon,
  facebook: FacebookIcon,
  x: XIcon,
  threads: ThreadsIcon,
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function isValidWhatsapp(value: string): boolean {
  const digits = value.replace(/[^\d]/g, '')
  return digits.length >= 9 && digits.length <= 15
}

export function AffiliateForm() {
  const submitLead = useServerFn(submitAffiliateLeadFn)
  const [nama, setNama] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [selected, setSelected] = useState<AffiliatePlatformKey[]>([])
  const [usernames, setUsernames] = useState<
    Partial<Record<AffiliatePlatformKey, string>>
  >({})
  const [errors, setErrors] = useState<AffiliateFieldErrors>({})
  const [banner, setBanner] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const selectedPlatforms = useMemo(
    () => affiliatePlatforms.filter((p) => selected.includes(p.key)),
    [selected],
  )

  function togglePlatform(key: AffiliatePlatformKey) {
    setSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    )
    setErrors((current) => ({ ...current, platforms: false }))
  }

  function setUsername(key: AffiliatePlatformKey, value: string) {
    setUsernames((current) => ({ ...current, [key]: value }))
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBanner('')

    const nextErrors: AffiliateFieldErrors = {}
    if (!nama.trim()) nextErrors.nama = true
    if (selected.length === 0) nextErrors.platforms = true
    for (const platform of selectedPlatforms) {
      if (!usernames[platform.key]?.trim()) {
        nextErrors[`user-${platform.key}`] = true
      }
    }
    if (!isValidEmail(email)) nextErrors.email = true
    if (!isValidWhatsapp(whatsapp)) nextErrors.whatsapp = true

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setBanner(
        'Ada beberapa data yang belum lengkap/valid — cek lagi ya, sudah kami tandain di atas.',
      )
      return
    }

    setLoading(true)

    try {
      const cleanedUsernames: Record<string, string> = {}
      for (const platform of selectedPlatforms) {
        const value = usernames[platform.key]?.trim()
        if (value) cleanedUsernames[platform.key] = value
      }

      const result = await submitLead({
        data: {
          nama: nama.trim(),
          email: email.trim(),
          whatsapp: whatsapp.trim(),
          platforms: selected,
          usernames: cleanedUsernames,
        },
      })

      if (!result.ok) {
        if (result.fields) setErrors(result.fields)
        setBanner(
          result.error ||
            'Gagal mengirim data, coba lagi sebentar ya. Kalau masih gagal, hubungi kami lewat halaman Kontak.',
        )
        return
      }

      setSuccess(true)
    } catch (err) {
      setBanner(
        err instanceof Error
          ? err.message
          : 'Gagal mengirim data, coba lagi sebentar ya. Kalau masih gagal, hubungi kami lewat halaman Kontak.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="aff-form-card intro-4" id="daftar">
      {banner ? <div className="aff-banner">{banner}</div> : null}

      {success ? (
        <div className="aff-success">
          <div className="aff-success-icon">
            <CheckIcon />
          </div>
          <h3>Pendaftaran Berhasil!</h3>
          <p>
            Tim kami bakal review data kamu dan kirim link affiliate +
            instruksi lengkap lewat Email & WhatsApp yang kamu daftarin,
            biasanya dalam 1x24 jam.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <div className="aff-form-title">Daftar affiliate</div>
          <p className="aff-form-sub">
            Review singkat. Link pribadi dikirim ke email & WhatsApp kamu.
          </p>

          <div className="aff-field">
            <label htmlFor="nama">Nama Lengkap</label>
            <input
              type="text"
              id="nama"
              name="nama"
              placeholder="Nama sesuai KTP"
              autoComplete="name"
              value={nama}
              className={errors.nama ? 'is-error' : undefined}
              onChange={(e) => {
                setNama(e.target.value)
                setErrors((current) => ({ ...current, nama: false }))
              }}
            />
            {errors.nama ? <div className="aff-err">Nama wajib diisi.</div> : null}
          </div>

          <div className="aff-field">
            <label>
              Kamu aktif promosi/jualan di platform mana?{' '}
              <span className="opt">(boleh pilih lebih dari satu)</span>
            </label>
            <div className="aff-platforms">
              {affiliatePlatforms.map((platform) => {
                const Icon = platformIcons[platform.key]
                const checked = selected.includes(platform.key)
                return (
                  <label
                    key={platform.key}
                    className={checked ? 'aff-chip is-on' : 'aff-chip'}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePlatform(platform.key)}
                    />
                    <Icon />
                    {platform.value === 'X (Twitter)' ? 'X' : platform.value}
                  </label>
                )
              })}
            </div>
            {errors.platforms ? (
              <div className="aff-err">Pilih minimal 1 platform.</div>
            ) : null}

            <div className="aff-usernames">
              {selectedPlatforms.map((platform) => {
                const Icon = platformIcons[platform.key]
                return (
                  <div
                    key={platform.key}
                    className={
                      errors[`user-${platform.key}`]
                        ? 'aff-userbox is-error'
                        : 'aff-userbox'
                    }
                  >
                    <span className="aff-userbox-icon">
                      <Icon />
                    </span>
                    <input
                      type="text"
                      placeholder={platform.placeholder}
                      aria-label={platform.label}
                      value={usernames[platform.key] ?? ''}
                      onChange={(e) => {
                        setUsername(platform.key, e.target.value)
                        setErrors((current) => ({
                          ...current,
                          [`user-${platform.key}`]: false,
                        }))
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          <div className="aff-field">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder="email@kamu.com"
              autoComplete="email"
              value={email}
              className={errors.email ? 'is-error' : undefined}
              onChange={(e) => {
                setEmail(e.target.value)
                setErrors((current) => ({ ...current, email: false }))
              }}
            />
            <div className="aff-hint">
              Link affiliate & undangan bakal dikirim ke email ini.
            </div>
            {errors.email ? (
              <div className="aff-err">Masukin email yang valid.</div>
            ) : null}
          </div>

          <div className="aff-field">
            <label htmlFor="whatsapp">Nomor WhatsApp</label>
            <input
              type="tel"
              id="whatsapp"
              name="whatsapp"
              placeholder="08xxxxxxxxxx"
              autoComplete="tel"
              inputMode="numeric"
              value={whatsapp}
              className={errors.whatsapp ? 'is-error' : undefined}
              onChange={(e) => {
                setWhatsapp(e.target.value)
                setErrors((current) => ({ ...current, whatsapp: false }))
              }}
            />
            <div className="aff-hint">
              Kami juga bakal follow-up lewat WhatsApp ke nomor ini.
            </div>
            {errors.whatsapp ? (
              <div className="aff-err">
                Masukin nomor WhatsApp yang valid (10-15 digit).
              </div>
            ) : null}
          </div>

          <button type="submit" className="aff-submit" disabled={loading}>
            {loading ? 'Mengirim…' : 'Daftar sekarang'}
          </button>
          <div className="aff-footnote">
            Dengan daftar, kamu setuju data kamu dipakai buat proses affiliate
            Ternak Review.
          </div>
        </form>
      )}
    </div>
  )
}
