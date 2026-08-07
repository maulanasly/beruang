import { parseLedgerJson } from './useLedgerIo'
import { LOCALE_OPTIONS, CURRENCY_OPTIONS } from './i18nOptions'
import { MARKET_OPTIONS } from './useMarket'

export const PORTFOLIO_BACKUP_APP = 'beruang'
export const PORTFOLIO_BACKUP_VERSION = 1

export const PORTFOLIO_ASSETS = ['mutual-funds', 'stocks', 'term-deposits']

function sanitizeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const validLocales = LOCALE_OPTIONS.map((o) => o.value)
  const validCurrencies = CURRENCY_OPTIONS.map((o) => o.value)
  const validMarkets = MARKET_OPTIONS.map((o) => o.value)
  const settings = {}
  if (validLocales.includes(source.locale)) settings.locale = source.locale
  if (validCurrencies.includes(source.currency)) settings.currency = source.currency
  if (validMarkets.includes(source.market)) settings.market = source.market
  return settings
}

export function exportPortfolioJson(ledgers, settings) {
  return JSON.stringify(
    {
      app: PORTFOLIO_BACKUP_APP,
      version: PORTFOLIO_BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      settings: { ...settings },
      ledgers: {
        'mutual-funds': [...(ledgers?.['mutual-funds'] ?? [])],
        stocks: [...(ledgers?.stocks ?? [])],
        'term-deposits': {
          apy: ledgers?.['term-deposits']?.apy ?? 0.06,
          entries: [...((ledgers?.['term-deposits']?.entries ?? []))],
        },
      },
    },
    null,
    2,
  )
}

function error(line, type, field) {
  return field ? { line, type, field } : { line, type }
}

export function parsePortfolioJson(text) {
  let parsed
  try {
    parsed = JSON.parse(String(text || ''))
  } catch {
    return { ok: false, data: null, errors: [error(1, 'invalidJson')] }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, data: null, errors: [error(1, 'invalidStructure')] }
  }
  if (parsed.app !== PORTFOLIO_BACKUP_APP) {
    return { ok: false, data: null, errors: [error(1, 'invalidApp')] }
  }

  const rawLedgers = parsed.ledgers
  if (!rawLedgers || typeof rawLedgers !== 'object' || Array.isArray(rawLedgers)) {
    return { ok: false, data: null, errors: [error(1, 'invalidStructure')] }
  }

  const errors = []
  const ledgers = {}

  for (const asset of PORTFOLIO_ASSETS) {
    if (asset === 'term-deposits') {
      const td = rawLedgers['term-deposits']
      if (!td || typeof td !== 'object' || Array.isArray(td)) {
        errors.push(error(1, 'invalidStructure', asset))
        continue
      }
      const apy = Number(td.apy)
      if (typeof td.apy !== 'number' || Number.isNaN(apy)) {
        errors.push(error(1, 'invalidNumber', 'apy'))
      }
      const { entries, errors: entryErrors } = parseLedgerJson(
        asset,
        JSON.stringify(Array.isArray(td.entries) ? td.entries : []),
      )
      ledgers['term-deposits'] = {
        apy: typeof td.apy === 'number' && !Number.isNaN(apy) ? td.apy : 0.06,
        entries,
      }
      errors.push(...entryErrors)
    } else {
      const raw = rawLedgers[asset]
      if (!Array.isArray(raw)) {
        errors.push(error(1, 'invalidStructure', asset))
        continue
      }
      const { entries, errors: entryErrors } = parseLedgerJson(asset, JSON.stringify(raw))
      ledgers[asset] = entries
      errors.push(...entryErrors)
    }
  }

  if (errors.length) {
    return { ok: false, data: null, errors }
  }

  return {
    ok: true,
    data: {
      app: parsed.app,
      version: parsed.version,
      settings: sanitizeSettings(parsed.settings),
      ledgers,
    },
    errors: [],
  }
}
