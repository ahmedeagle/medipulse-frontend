import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserX, CheckCircle, XCircle } from 'lucide-react'
import { adminApi } from '../../api/admin.api'
import { Table } from '../../components/ui/Table'
import { FullPageSpinner } from '../../components/ui/Spinner'
import type { AdminUser } from '../../types'

const roleLabels: Record<string, string> = {
  pharmacy_admin: 'Pharmacy Admin',
  supplier_admin: 'Supplier Admin',
  system_admin: 'System Admin',
}

const roleColors: Record<string, string> = {
  pharmacy_admin: 'bg-blue-100 text-blue-800',
  supplier_admin: 'bg-indigo-100 text-indigo-800',
  system_admin: 'bg-red-100 text-red-800',
}

export default function UsersPage() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.getUsers().then((r) => r.data),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => adminApi.deactivateUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const users: AdminUser[] = data || []

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (_: any, row: AdminUser) => (
        <div>
          <p className="font-medium text-gray-900">
            {row.firstName} {row.lastName}
          </p>
          <p className="text-xs text-gray-400">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (_: any, row: AdminUser) => (
        <span className="text-sm text-gray-600">{row.email}</span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (_: any, row: AdminUser) => (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            roleColors[row.role] || 'bg-gray-100 text-gray-800'
          }`}
        >
          {roleLabels[row.role] || row.role}
        </span>
      ),
    },
    {
      key: 'tenant',
      header: 'Tenant',
      render: (_: any, row: AdminUser) => (
        <span className="text-sm text-gray-600">{row.tenant?.name || '—'}</span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (_: any, row: AdminUser) =>
        row.isActive !== false ? (
          <span className="flex items-center gap-1 text-green-600 text-sm">
            <CheckCircle size={14} />
            Active
          </span>
        ) : (
          <span className="flex items-center gap-1 text-red-500 text-sm">
            <XCircle size={14} />
            Inactive
          </span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: any, row: AdminUser) => (
        <div className="flex items-center gap-2">
          {row.isActive !== false && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (confirm(`Deactivate ${row.firstName} ${row.lastName}?`)) {
                  deactivateMutation.mutate(row.id)
                }
              }}
              disabled={deactivateMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
            >
              <UserX size={13} />
              Deactivate
            </button>
          )}
        </div>
      ),
    },
  ]

  if (isLoading) return <FullPageSpinner />

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {users.length} registered user{users.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <Table columns={columns} data={users} emptyMessage="No users found." />
      </div>
    </div>
  )
}
