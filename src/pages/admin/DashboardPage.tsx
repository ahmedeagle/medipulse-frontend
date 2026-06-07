import { useQuery } from '@tanstack/react-query'
import { Building2, Users, Store } from 'lucide-react'
import { adminApi } from '../../api/admin.api'
import { StatCard } from '../../components/ui/StatCard'
import { Table } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import { FullPageSpinner } from '../../components/ui/Spinner'
import type { Tenant } from '../../types'

export default function AdminDashboardPage() {
  const { data: tenantsData, isLoading: tenantsLoading } = useQuery({
    queryKey: ['admin-tenants', 'dashboard'],
    queryFn: () => adminApi.getTenants({ limit: 200 }).then((r) => r.data?.data ?? r.data),
  })

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users', 'dashboard'],
    queryFn: () => adminApi.getUsers({ limit: 200 }).then((r) => r.data?.data ?? r.data),
  })

  const tenants: Tenant[] = tenantsData || []
  const users: any[] = usersData || []

  const pharmacies = tenants.filter((t) => t.type === 'pharmacy')
  const suppliers = tenants.filter((t) => t.type === 'supplier')

  if (tenantsLoading || usersLoading) return <FullPageSpinner />

  const tenantColumns = [
    {
      key: 'name',
      header: 'Name',
      render: (_: any, row: Tenant) => <span className="font-medium text-gray-900">{row.name}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (_: any, row: Tenant) => <Badge status={row.type} />,
    },
    {
      key: 'slug',
      header: 'Slug',
      render: (_: any, row: Tenant) => (
        <span className="font-mono text-xs text-gray-500">{row.slug}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (_: any, row: Tenant) =>
        row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">System Admin Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Platform-wide overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Pharmacies"
          value={pharmacies.length}
          icon={Store}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <StatCard
          title="Total Suppliers"
          value={suppliers.length}
          icon={Building2}
          iconColor="text-indigo-600"
          iconBg="bg-indigo-50"
        />
        <StatCard
          title="Total Users"
          value={users.length}
          icon={Users}
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Recent Tenants</h2>
        <Table
          columns={tenantColumns}
          data={tenants.slice(0, 10)}
          emptyMessage="No tenants registered yet."
        />
      </div>
    </div>
  )
}
