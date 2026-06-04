import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Building2, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { profileApi } from '../../api/profile.api';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';

const SAUDI_REGIONS = ['riyadh', 'jeddah', 'dammam', 'mecca', 'medina', 'ksa_north', 'ksa_south', 'ksa_east', 'ksa_west'];

export default function SupplierProfilePage() {
  const qc = useQueryClient();
  const { t } = useTranslation();

  const STATUS_CONFIG = {
    pending_review: { label: t('supplier.verification.pending'),  color: 'yellow', icon: Clock },
    verified:       { label: t('supplier.verification.verified'), color: 'green',  icon: CheckCircle },
    rejected:       { label: t('supplier.verification.rejected'), color: 'red',    icon: AlertCircle },
    suspended:      { label: t('supplier.verification.suspended'),color: 'gray',   icon: AlertCircle },
  } as const;

  const { data: profile, isLoading } = useQuery({
    queryKey: ['supplier-profile'],
    queryFn: () => profileApi.getOwn().then((r) => r.data),
  });

  const [form, setForm] = useState({
    companyName:        '',
    registrationNumber: '',
    licenseNumber:      '',
    address:            '',
    phone:              '',
    website:            '',
    deliveryZones:      [] as string[],
    minOrderAmount:     0,
    maxDeliveryDays:    7,
    paymentTerms:       '',
  });

  const [initialised, setInitialised] = useState(false);
  if (profile && !initialised) {
    setForm({
      companyName:        profile.companyName        ?? '',
      registrationNumber: profile.registrationNumber ?? '',
      licenseNumber:      profile.licenseNumber      ?? '',
      address:            profile.address            ?? '',
      phone:              profile.phone              ?? '',
      website:            profile.website            ?? '',
      deliveryZones:      profile.deliveryZones      ?? [],
      minOrderAmount:     profile.minOrderAmount     ?? 0,
      maxDeliveryDays:    profile.maxDeliveryDays    ?? 7,
      paymentTerms:       profile.paymentTerms       ?? '',
    });
    setInitialised(true);
  }

  const save = useMutation({
    mutationFn: () => profileApi.upsert(form),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier-profile'] }),
  });

  const toggleZone = (zone: string) =>
    setForm((f) => ({
      ...f,
      deliveryZones: f.deliveryZones.includes(zone)
        ? f.deliveryZones.filter((z) => z !== zone)
        : [...f.deliveryZones, zone],
    }));

  if (isLoading) return <Spinner />;

  const status = profile?.status ?? 'pending_review';
  const StatusIcon = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.icon ?? Clock;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('supplier.profile')}</h1>
          <p className="text-gray-500 text-sm mt-1">Your business profile — visible to pharmacies after admin verification.</p>
        </div>
        {profile && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200">
            <StatusIcon size={14} />
            <span className="text-sm font-medium text-gray-700">{STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.label ?? status}</span>
          </div>
        )}
      </div>

      {profile?.status === 'rejected' && profile.rejectionReason && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <strong>Rejection reason:</strong> {profile.rejectionReason}
        </div>
      )}

      {profile?.status === 'pending_review' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
          Your profile is under review. Updates will reset the verification status.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="flex items-center gap-2 mb-2">
          <Building2 size={18} className="text-blue-600" />
          <h2 className="font-semibold text-gray-800">Business Information</h2>
        </div>

        {[
          { label: 'Company Name *', key: 'companyName' },
          { label: 'Registration Number', key: 'registrationNumber' },
          { label: 'License Number', key: 'licenseNumber' },
          { label: 'Address', key: 'address' },
          { label: 'Phone', key: 'phone' },
          { label: 'Website', key: 'website' },
          { label: 'Payment Terms (e.g. Net 30)', key: 'paymentTerms' },
        ].map(({ label, key }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={(form as any)[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            />
          </div>
        ))}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Order (SAR)</label>
            <input
              type="number" min={0}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.minOrderAmount}
              onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Delivery Days</label>
            <input
              type="number" min={1}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.maxDeliveryDays}
              onChange={(e) => setForm((f) => ({ ...f, maxDeliveryDays: Number(e.target.value) }))}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Zones</label>
          <div className="flex flex-wrap gap-2">
            {SAUDI_REGIONS.map((zone) => (
              <button
                key={zone}
                type="button"
                onClick={() => toggleZone(zone)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  form.deliveryZones.includes(zone)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                }`}
              >
                {zone}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={() => save.mutate()}
        disabled={!form.companyName || save.isPending}
        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        <Save size={16} />
        {save.isPending ? t('common.loading') : save.isSuccess ? 'Saved ✓' : t('common.save')}
      </button>
    </div>
  );
}
