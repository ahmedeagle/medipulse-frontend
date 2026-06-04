import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { adminApi } from '../../api/admin.api'
import { Modal } from '../../components/ui/Modal'
import { Table } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import { FullPageSpinner } from '../../components/ui/Spinner'
import type { Tenant } from '../../types'

interface TenantForm {
  name: string
  slug: string
  type: 'pharmacy' | 'supplier'
}

export default function TenantsPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<TenantForm>({ name: '', slug: '', type: 'pharmacy' })
  const [formError, setFormError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => adminApi.getTenants().then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: TenantForm) => adminApi.createTenant(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      setShowAdd(false)
      setForm({ name: '', slug: '', type: 'pharmacy' })
      setFormError(null)
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message || 'Failed to create tenant.')
    },
  })

  const tenants: Tenant[] = data || []

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (_: any, row: Tenant) => (
        <span className="font-semibold text-gray-900">{row.name}</span>
      ),
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
        <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{row.slug}</span>
      ),
    },
    {
      key: 'isActive',
      header: 'Active',
      render: (_: any, row: Tenant) =>
        row.isActive !== false ? (
          <span className="flex items-center gap-1 text-green-600 text-sm"><CheckCircle size={15} /> Active</span>
        ) : (
          <span className="flex items-center gap-1 text-red-500 text-sm"><XCircle size={15} /> Inactive</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (_: any, row: Tenant) =>
        row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—',
    },
  ]

  if (isLoading) return <FullPageSpinner />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {tenants.length} tenant{tenants.length !== 1 ? 's' : ''} registered
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setFormError(null) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          Add Tenant
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <Table columns={columns} data={tenants} emptyMessage="No tenants found." />
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add New Tenant">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createMutation.mutate(form)
          }}
          className="space-y-4"
        >
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              {formError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tenant Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value, slug: autoSlug(e.target.value) })}
              placeholder="e.g. Al-Shifa Pharmacy"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Slug</label>
            <input
              type="text"
              required
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="al-shifa-pharmacy"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">URL-friendly identifier (auto-generated from name)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as 'pharmacy' | 'supplier' })}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="pharmacy">Pharmacy</option>
              <option value="supplier">Supplier</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors">
              {createMutation.isPending ? 'Creating…' : 'Create Tenant'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
