import { useQuery } from '@tanstack/react-query'
import { pharmacySettingsApi } from '../api/pharmacy-settings.api'

export function useCurrency() {
  const { data } = useQuery({
    queryKey: ['pharmacy-settings'],
    queryFn: pharmacySettingsApi.getSettings,
    staleTime: 5 * 60_000,
  })
  const currency = data?.currency ?? 'EGP'
  return {
    currency,
    fmt: (n: number) =>
      `${currency} ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  }
}
