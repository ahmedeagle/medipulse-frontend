import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BRAND } from '../hooks/usePageTitle'

/**
 * Pattern → i18n key (resolved against `nav.*` namespace).
 *
 * Patterns are matched in order. `:id` placeholders match a single segment.
 * Wildcards (`*`) match the rest of the path.
 */
const ROUTE_TITLES: Array<[RegExp, string]> = [
  // Pharmacy
  [/^\/pharmacy\/?$/,                      'nav.dashboard'],
  [/^\/pharmacy\/queue/,                   'nav.procurement_queue'],
  [/^\/pharmacy\/ai$/,                     'nav.ai_recommendations'],
  [/^\/pharmacy\/forecast/,                'nav.forecast'],
  [/^\/pharmacy\/eoq/,                     'nav.order_schedule'],
  [/^\/pharmacy\/dead-stock/,              'nav.dead_stock'],
  [/^\/pharmacy\/analytics/,               'nav.analytics'],
  [/^\/pharmacy\/inventory/,               'nav.inventory'],
  [/^\/pharmacy\/catalog-requests/,        'nav.catalog_requests'],
  [/^\/pharmacy\/catalog/,                 'nav.supplier_catalog'],
  [/^\/pharmacy\/orders\/[^/]+/,           'nav.order_detail'],
  [/^\/pharmacy\/orders/,                  'nav.orders'],
  [/^\/pharmacy\/connections/,             'nav.preferred_suppliers'],

  // Supplier
  [/^\/supplier\/?$/,                      'nav.dashboard'],
  [/^\/supplier\/catalog/,                 'nav.my_catalog'],
  [/^\/supplier\/orders\/[^/]+/,           'nav.order_detail'],
  [/^\/supplier\/orders/,                  'nav.orders'],
  [/^\/supplier\/profile/,                 'nav.profile'],
  [/^\/supplier\/import/,                  'nav.bulk_import'],
  [/^\/supplier\/demand/,                  'nav.demand_signals'],

  // Admin
  [/^\/admin\/?$/,                         'nav.dashboard'],
  [/^\/admin\/tenants/,                    'nav.tenants'],
  [/^\/admin\/users/,                      'nav.users'],
  [/^\/admin\/organizations/,              'nav.organizations'],
  [/^\/admin\/integrations/,               'nav.integrations'],
  [/^\/admin\/audit/,                      'nav.audit_logs'],
  [/^\/admin\/recalls/,                    'nav.recalls'],

  // Chain
  [/^\/chain\/?$/,                         'nav.dashboard'],

  // Auth
  [/^\/login/,                             'nav.login'],
  [/^\/auth\/callback/,                    'nav.signing_in'],
]

const FALLBACK_KEY = 'nav.app'

export function RouteTitle() {
  const { pathname } = useLocation()
  const { t, i18n } = useTranslation()

  useEffect(() => {
    const match = ROUTE_TITLES.find(([re]) => re.test(pathname))
    const key = match ? match[1] : FALLBACK_KEY
    // i18next returns the key itself if missing — guard against that.
    const translated = t(key)
    const section = translated && translated !== key ? translated : ''
    document.title = section ? `${section} · ${BRAND}` : BRAND
  }, [pathname, i18n.language, t])

  return null
}
