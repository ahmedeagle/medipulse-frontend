import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Settings, Globe, Building2, Receipt, Tag, Users, Package,
  Store, Sliders, ChevronRight, Save, Plus, Trash2, Pencil,
  Check, X, ToggleLeft, ToggleRight, MapPin, Phone, Mail,
  FileText, Printer, Barcode, Warehouse, Bell, Shield,
  AlertCircle, Loader2, Eye, EyeOff, ExternalLink,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import {
  pharmacySettingsApi,
  type PharmacySettingsData,
  type Warehouse as WarehouseType,
  type NotificationSettings,
} from '../../api/pharmacy-settings.api'

// ── Types ──────────────────────────────────────────────────────────────────────

type SectionId =
  | 'general'
  | 'profile'
  | 'receipt'
  | 'labels'
  | 'users'
  | 'inventory'
  | 'seller'
  | 'extra'

interface Section {
  id: SectionId
  labelAr: string
  labelEn: string
  icon: React.ElementType
  descAr: string
  descEn: string
}

const SECTIONS: Section[] = [
  { id: 'general',   icon: Globe,      labelAr: 'الإعدادات العامة',       labelEn: 'General Settings',       descAr: 'اللغة، العملة، المنطقة الزمنية، الضرائب',       descEn: 'Language, currency, timezone, tax'              },
  { id: 'profile',   icon: Building2,  labelAr: 'بيانات الصيدلية',        labelEn: 'Pharmacy Profile',        descAr: 'الاسم، الموقع، رقم الترخيص',                   descEn: 'Name, location, license number'                 },
  { id: 'receipt',   icon: Receipt,    labelAr: 'إعدادات الإيصال',        labelEn: 'Receipt Settings',        descAr: 'الرأس، التذييل، الطباعة، حجم الورق',            descEn: 'Header, footer, printing, paper size'           },
  { id: 'labels',    icon: Tag,        labelAr: 'إعدادات الملصقات',       labelEn: 'Label Templates',         descAr: 'نماذج الباركود والملصقات',                      descEn: 'Barcode & product label templates'              },
  { id: 'users',     icon: Users,      labelAr: 'إعدادات المستخدمين',     labelEn: 'Users & Permissions',     descAr: 'الفريق، الأدوار، الصلاحيات',                    descEn: 'Team members, roles, access control'            },
  { id: 'inventory', icon: Warehouse,  labelAr: 'إعدادات المخزون',        labelEn: 'Inventory Settings',      descAr: 'المستودعات، إعادة التخزين، التنبيهات',          descEn: 'Warehouses, reorder settings, alerts'           },
  { id: 'seller',    icon: Store,      labelAr: 'إعدادات البائع',         labelEn: 'Seller Settings',         descAr: 'ملف البائع، التوصيل، التشغيل التلقائي',         descEn: 'Seller profile, delivery, automations'          },
  { id: 'extra',     icon: Sliders,    labelAr: 'إعدادات إضافية',         labelEn: 'Additional Settings',     descAr: 'الإشعارات، الخصوصية، تصدير البيانات',           descEn: 'Notifications, privacy, data export'            },
]

// ── Barcode visual data ────────────────────────────────────────────────────────

const BARCODE_OPTIONS = [
  {
    value: 'CODE128' as const,
    label: 'CODE128',
    desc: 'يدعم كل الأحرف والأرقام — الأكثر شيوعاً',
    recommended: true,
    bars: [2,1,2,2,1,3,1,2,2,1,1,2,3,1,1,3,1,2,2,1,3,1,1,2,2,1,2,1,1,3,2,1],
  },
  {
    value: 'CODE39' as const,
    label: 'CODE39',
    desc: 'أرقام وحروف إنجليزية كبيرة فقط',
    bars: [2,1,1,2,1,2,1,2,1,1,3,1,1,2,1,2,1,1,3,1,1,2,2,1,1,2],
  },
  {
    value: 'EAN13' as const,
    label: 'EAN-13',
    desc: 'للمنتجات التجارية الدولية (13 رقماً)',
    bars: [1,1,1,2,3,1,2,1,1,2,1,1,2,1,2,1,1,2,3,1,1,2,1,1,1],
    hasDigits: true,
  },
] as const

const LABEL_SIZES = [
  { value: 'small'  as const, label: 'صغير',  dims: '1 × 1 بوصة',        w: 36, h: 36 },
  { value: 'medium' as const, label: 'متوسط', dims: '1.75 × 2.36 بوصة',  w: 50, h: 68, recommended: true },
  { value: 'large'  as const, label: 'كبير',  dims: '1.5 × 2.5 بوصة',    w: 43, h: 72 },
  { value: 'custom' as const, label: 'مخصص',  dims: 'أبعاد يدوية',        w: 60, h: 46 },
]

function BarcodeSvg({ bars, hasDigits, height = 28 }: {
  bars: readonly number[]; hasDigits?: boolean; height?: number
}) {
  const rects: { x: number; w: number }[] = []
  let x = 0
  bars.forEach((w, i) => {
    if (i % 2 === 0) rects.push({ x, w })
    x += w
  })
  const total = x
  const svgH = hasDigits ? height + 8 : height
  return (
    <svg viewBox={`0 0 ${total} ${svgH}`} className="w-full" style={{ height: svgH }}>
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={0} width={r.w} height={height} fill="currentColor" />
      ))}
      {hasDigits && (
        <text x={total / 2} y={svgH - 1} textAnchor="middle" fontSize="5" fontFamily="monospace" fill="currentColor">
          6 91234 56789 0
        </text>
      )}
    </svg>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function SectionCard({ id, title, desc, children }: {
  id: SectionId; title: string; desc: string; children: React.ReactNode
}) {
  return (
    <div id={`section-${id}`} className="bg-white rounded-2xl border border-gray-200 overflow-hidden scroll-mt-20">
      <div className="px-4 sm:px-6 py-5 border-b border-gray-100">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
      </div>
      <div className="px-4 sm:px-6 py-6">{children}</div>
    </div>
  )
}

const FIELD = 'block text-sm font-medium text-gray-700 mb-1.5'
const INPUT = 'w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all bg-white'
const SELECT = INPUT + ' appearance-none cursor-pointer'

function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-50 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {desc && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none',
          checked ? 'bg-emerald-500' : 'bg-gray-200',
        )}
      >
        <span className={clsx(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-200',
          checked ? 'ltr:translate-x-5 rtl:-translate-x-5' : 'translate-x-0',
        )} />
      </button>
    </div>
  )
}

function FreqBadge({ label, color }: { label: string; color: 'red' | 'orange' | 'emerald' }) {
  const styles = {
    red:     'bg-red-50 text-red-600 border-red-100',
    orange:  'bg-orange-50 text-orange-600 border-orange-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  }
  return (
    <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0', styles[color])}>
      {label}
    </span>
  )
}

function NotifToggle({ checked, onChange, label, desc, freq, freqColor }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string;
  freq: string; freqColor: 'red' | 'orange' | 'emerald'
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-50 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-gray-900">{label}</p>
          <FreqBadge label={freq} color={freqColor} />
        </div>
        {desc && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none',
          checked ? 'bg-emerald-500' : 'bg-gray-200',
        )}
      >
        <span className={clsx(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-200',
          checked ? 'ltr:translate-x-5 rtl:-translate-x-5' : 'translate-x-0',
        )} />
      </button>
    </div>
  )
}

function SaveButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <div className="flex justify-end pt-4 border-t border-gray-100 mt-6">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        حفظ التغييرات
      </button>
    </div>
  )
}

// ── Receipt live preview ───────────────────────────────────────────────────────

function ReceiptPreview({ header, footer, showPhone, showAddress, showTaxNumber, size }: {
  header?: string; footer?: string; showPhone?: boolean; showAddress?: boolean; showTaxNumber?: boolean; size?: string
}) {
  return (
    <div className={clsx(
      'bg-white border-2 border-dashed border-gray-200 rounded-2xl p-4 font-mono text-[10px] leading-relaxed text-gray-700 mx-auto shadow-sm',
      size === 'A4' ? 'max-w-[160px]' : 'max-w-[110px]',
    )}>
      <div className="text-center border-b border-gray-200 pb-2 mb-2">
        <p className="font-bold text-xs">{header || 'اسم الصيدلية'}</p>
        {showAddress && <p className="text-gray-400">123 شارع رئيسي</p>}
        {showPhone && <p className="text-gray-400">01012345678</p>}
        {showTaxNumber && <p className="text-gray-400">ض: 123-456</p>}
      </div>
      <div className="space-y-0.5 mb-2">
        <div className="flex justify-between"><span>باناكول</span><span>25.00</span></div>
        <div className="flex justify-between"><span>فيتامين C</span><span>45.00</span></div>
      </div>
      <div className="border-t border-gray-200 pt-1 flex justify-between font-bold">
        <span>الإجمالي</span><span>70.00</span>
      </div>
      {footer && <p className="text-center text-gray-400 mt-2 border-t border-gray-100 pt-1">{footer}</p>}
    </div>
  )
}

// ── Warehouse row ──────────────────────────────────────────────────────────────

function WarehouseRow({ wh, onEdit, onDelete, onToggle }: {
  wh: WarehouseType
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const isRTL = document.documentElement.dir === 'rtl'
  return (
    <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
      <div className="flex items-center gap-3 min-w-0">
        <div className={clsx(
          'p-2 rounded-lg shrink-0',
          wh.type === 'expiry' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600',
        )}>
          <Warehouse size={15} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{wh.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {wh.type === 'expiry' ? 'تخزين حسب الصلاحية' : 'تخزين عام'}
            {!wh.isActive && <span className="ms-2 text-red-500">· موقوف</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={onToggle} title={wh.isActive ? 'إيقاف' : 'تفعيل'}
          className={clsx('p-1.5 rounded-lg transition-colors text-xs',
            wh.isActive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100')}>
          {wh.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
        </button>
        <button onClick={onEdit} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
          <Pencil size={14} />
        </button>
        <button onClick={onDelete} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Warehouse modal ────────────────────────────────────────────────────────────

function WarehouseModal({ wh, onClose, onSave }: {
  wh?: WarehouseType | null
  onClose: () => void
  onSave: (data: { name: string; type: string; isActive: boolean }) => void
}) {
  const [name, setName] = useState(wh?.name ?? '')
  const [type, setType] = useState<'storage' | 'expiry'>(wh?.type ?? 'storage')
  const [isActive, setIsActive] = useState(wh?.isActive ?? true)

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">
            {wh ? 'تعديل موقع المستودع' : 'إضافة موقع مستودع'}
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={FIELD}>اسم موقع المستودع</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: المخزن الرئيسي" className={INPUT} />
          </div>
          <div>
            <label className={FIELD}>النوع</label>
            <select value={type} onChange={e => setType(e.target.value as any)} className={SELECT}>
              <option value="storage">تخزين</option>
              <option value="expiry">انتهاء الصلاحية</option>
            </select>
          </div>
          <Toggle checked={isActive} onChange={setIsActive} label="الحالة" desc="تفعيل أو إيقاف هذا الموقع" />
        </div>
        <div className="flex items-center justify-end gap-2 px-6 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50">إلغاء</button>
          <button
            onClick={() => { if (name.trim()) onSave({ name: name.trim(), type, isActive }) }}
            disabled={!name.trim()}
            className="px-5 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-50">
            {wh ? 'تعديل' : 'إنشاء'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MAIN PAGE ──────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { i18n } = useTranslation()
  const isRTL = i18n.language === 'ar'
  const qc = useQueryClient()

  const [activeSection, setActiveSection] = useState<SectionId>('general')
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Data
  const { data: settings, isLoading } = useQuery({
    queryKey: ['pharmacy-settings'],
    queryFn: pharmacySettingsApi.getSettings,
    staleTime: 60_000,
  })

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: pharmacySettingsApi.getWarehouses,
    staleTime: 60_000,
  })

  // Local form state — populated from server on load
  const [general, setGeneral] = useState({
    language: 'ar', currency: 'EGP', timezone: 'Africa/Cairo',
    dateFormat: 'YYYY-MM-DD', timeFormat: '12h', taxEnabled: true,
    vatCalculationMode: 'tax_on_net' as 'tax_on_net' | 'tax_on_gross',
    taxRegistrationNumber: '',
    vatRate: 14,
  })
  const [profile, setProfile] = useState({
    pharmacyNameAr: '', pharmacyNameEn: '', licenseNumber: '',
    pharmacyType: 'retail', phone: '', contactEmail: '',
    country: '', city: '', region: '', address: '', gpsLocation: '',
  })
  const [receipt, setReceipt] = useState({
    headerText: '', footerText: '', showLogo: true, showAddress: true,
    showTaxNumber: false, showPhone: true, language: 'ar' as 'ar' | 'en', paperSize: '80mm' as '80mm' | '58mm' | 'A4',
  })
  const [labels, setLabels] = useState({
    defaultSize: 'medium' as 'small' | 'medium' | 'large' | 'custom',
    barcodeType: 'CODE128' as 'CODE128' | 'CODE39' | 'EAN13',
    barcodeHeight: 40, showPharmacyName: true, showProductName: true,
    showPrice: true, showBarcode: true, showUom: true, showExpiry: true, showTax: false,
  })
  const [invSettings, setInvSettings] = useState({
    disableExpiryForNewBatches: false, reorderDays: 30,
    safetyStockPct: 20, expiryAlertDays: 90, reorderRecommendationType: 'to_safety_stock' as const,
  })
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>({
    enableLowStockAlerts: true, enableExpiryAlerts: true, enableDeadStockAlerts: true,
    enableP2POrderAlerts: true, enableSmartProcurementAlerts: true, enableClearanceAlerts: true,
    enablePosIntegrityAlerts: true, enableMorningBriefing: true,
  })

  // Sync local state when server data arrives
  useEffect(() => {
    if (!settings) return
    setGeneral({
      language: settings.language ?? 'ar',
      currency: settings.currency ?? 'EGP',
      timezone: settings.timezone ?? 'Africa/Cairo',
      dateFormat: settings.dateFormat ?? 'YYYY-MM-DD',
      timeFormat: settings.timeFormat ?? '12h',
      taxEnabled: settings.taxEnabled ?? true,
      vatCalculationMode: settings.taxSettings?.vatCalculationMode ?? 'tax_on_net',
      taxRegistrationNumber: settings.taxSettings?.taxRegistrationNumber ?? '',
      vatRate: settings.taxSettings?.vatRate ?? 14,
    })
    setProfile({
      pharmacyNameAr: settings.pharmacyNameAr ?? '',
      pharmacyNameEn: settings.pharmacyNameEn ?? '',
      licenseNumber: settings.licenseNumber ?? '',
      pharmacyType: settings.pharmacyType ?? 'retail',
      phone: settings.phone ?? '',
      contactEmail: settings.contactEmail ?? '',
      country: settings.country ?? '',
      city: settings.city ?? '',
      region: settings.region ?? '',
      address: settings.address ?? '',
      gpsLocation: settings.gpsLocation ?? '',
    })
    setReceipt({ ...receipt, ...settings.receiptSettings } as any)
    setLabels({ ...labels, ...settings.labelSettings } as any)
    setInvSettings({ ...invSettings, ...settings.inventorySettings } as any)
    const n = (settings.notificationSettings ?? {}) as Partial<NotificationSettings>
    setNotifSettings({
      enableLowStockAlerts:         n.enableLowStockAlerts         ?? true,
      enableExpiryAlerts:           n.enableExpiryAlerts           ?? true,
      enableDeadStockAlerts:        n.enableDeadStockAlerts        ?? true,
      enableP2POrderAlerts:         n.enableP2POrderAlerts         ?? true,
      enableSmartProcurementAlerts: n.enableSmartProcurementAlerts ?? true,
      enableClearanceAlerts:        n.enableClearanceAlerts        ?? true,
      enablePosIntegrityAlerts:     n.enablePosIntegrityAlerts     ?? true,
      enableMorningBriefing:        n.enableMorningBriefing        ?? true,
    })
  }, [settings])

  // Scrollspy
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length > 0) {
          const top = visible.reduce((a, b) => a.boundingClientRect.top < b.boundingClientRect.top ? a : b)
          const id = top.target.id.replace('section-', '') as SectionId
          setActiveSection(id)
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    )
    SECTIONS.forEach(s => {
      const el = document.getElementById(`section-${s.id}`)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [isLoading])

  const scrollTo = (id: SectionId) => {
    const el = document.getElementById(`section-${id}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveSection(id)
  }

  // Save mutations
  const saveMut = useMutation({
    mutationFn: (data: Partial<PharmacySettingsData>) => pharmacySettingsApi.updateSettings(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pharmacy-settings'] }),
  })
  const [savedSection, setSavedSection] = useState<SectionId | null>(null)
  const save = (section: SectionId, data: Partial<PharmacySettingsData>) => {
    saveMut.mutate(data, {
      onSuccess: () => {
        setSavedSection(section)
        setTimeout(() => setSavedSection(null), 2000)
      },
    })
  }

  // Warehouse mutations
  const createWhMut = useMutation({
    mutationFn: (d: any) => pharmacySettingsApi.createWarehouse(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouses'] }),
  })
  const updateWhMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => pharmacySettingsApi.updateWarehouse(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouses'] }),
  })
  const deleteWhMut = useMutation({
    mutationFn: (id: string) => pharmacySettingsApi.deleteWarehouse(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouses'] }),
  })

  const [whModal, setWhModal] = useState<WarehouseType | null | 'new'>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-emerald-600" />
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 min-h-screen" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── Left sidebar ──────────────────────────────────────────────────────── */}
      <aside className="hidden md:block w-56 shrink-0 sticky top-20 self-start">
        <div className="bg-white rounded-2xl border border-gray-200 p-2 space-y-0.5">
          <div className="px-3 py-2.5 mb-1">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">الإعدادات</p>
          </div>
          {SECTIONS.map(s => {
            const Icon = s.icon
            const isActive = activeSection === s.id
            return (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-start',
                  isActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                )}
              >
                <Icon size={15} className={isActive ? 'text-emerald-600' : 'text-gray-400'} />
                <span className="truncate">{isRTL ? s.labelAr : s.labelEn}</span>
                {isActive && <ChevronRight size={13} className="ms-auto text-emerald-500 shrink-0" />}
              </button>
            )
          })}
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-5 pb-20">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الإعدادات</h1>
          <p className="text-sm text-gray-500 mt-0.5">إدارة جميع إعدادات صيدليتك من مكان واحد.</p>
        </div>

        {/* ── 1. General Settings ─────────────────────────────────────────────── */}
        <SectionCard id="general"
          title="الإعدادات العامة"
          desc="اللغة، العملة، المنطقة الزمنية، وإعدادات الضرائب"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={FIELD}>اللغة</label>
              <select value={general.language} onChange={e => setGeneral(p => ({ ...p, language: e.target.value }))} className={SELECT}>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className={FIELD}>العملة</label>
              <select value={general.currency} onChange={e => setGeneral(p => ({ ...p, currency: e.target.value }))} className={SELECT}>
                <option value="EGP">الجنيه المصري (EGP)</option>
                <option value="SAR">الريال السعودي (SAR)</option>
                <option value="AED">الدرهم الإماراتي (AED)</option>
                <option value="USD">الدولار الأمريكي (USD)</option>
              </select>
            </div>
            <div>
              <label className={FIELD}>المنطقة الزمنية</label>
              <select value={general.timezone} onChange={e => setGeneral(p => ({ ...p, timezone: e.target.value }))} className={SELECT}>
                <option value="Africa/Cairo">أفريقيا / القاهرة (UTC+3)</option>
                <option value="Asia/Riyadh">آسيا / الرياض (UTC+3)</option>
                <option value="Asia/Dubai">آسيا / دبي (UTC+4)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div>
              <label className={FIELD}>تنسيق التاريخ</label>
              <select value={general.dateFormat} onChange={e => setGeneral(p => ({ ...p, dateFormat: e.target.value }))} className={SELECT}>
                <option value="YYYY-MM-DD">2026-06-11</option>
                <option value="DD/MM/YYYY">11/06/2026</option>
                <option value="MM/DD/YYYY">06/11/2026</option>
              </select>
            </div>
            <div>
              <label className={FIELD}>تنسيق الوقت</label>
              <select value={general.timeFormat} onChange={e => setGeneral(p => ({ ...p, timeFormat: e.target.value }))} className={SELECT}>
                <option value="12h">12 ساعة (PM 12:23)</option>
                <option value="24h">24 ساعة (14:23)</option>
              </select>
            </div>
          </div>

          <div className="mt-5 p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-0">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">إعدادات الضرائب</p>
            <Toggle
              checked={general.taxEnabled}
              onChange={v => setGeneral(p => ({ ...p, taxEnabled: v }))}
              label="البلد يحتاج إلى إظهار الضرائب"
              desc="عند التفعيل، ستظهر معلومات الضرائب في المشتريات، الإيصالات، ونقطة البيع"
            />

            {general.taxEnabled && (
              <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                <div>
                  <label className={FIELD}>نسبة ضريبة القيمة المضافة (%)</label>
                  <input
                    dir="ltr"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={general.vatRate}
                    onChange={e => setGeneral(p => ({ ...p, vatRate: e.target.value === '' ? 0 : Number(e.target.value) }))}
                    placeholder="14"
                    className={INPUT}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    تُطبَّق على طلبات الشراء والفواتير. الافتراضي: مصر 14٪، السعودية 15٪، الإمارات/عمان 5٪، البحرين 10٪.
                  </p>
                </div>

                <div>
                  <label className={FIELD}>الرقم الضريبي (اختياري)</label>
                  <input
                    dir="ltr"
                    value={general.taxRegistrationNumber}
                    onChange={e => setGeneral(p => ({ ...p, taxRegistrationNumber: e.target.value }))}
                    placeholder="مثال: 123-456-789"
                    className={INPUT}
                  />
                  <p className="text-xs text-gray-500 mt-1">يظهر على الفواتير والإيصالات الضريبية</p>
                </div>

                <div>
                  <label className={FIELD}>طريقة احتساب الضريبة عند وجود خصم على الفاتورة</label>
                  <p className="text-xs text-gray-500 mb-3">
                    يحدد كيف يُحسب ضريبة القيمة المضافة عندما يكون هناك خصم على إجمالي الفاتورة (وليس على السطر).
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setGeneral(p => ({ ...p, vatCalculationMode: 'tax_on_net' }))}
                      className={clsx(
                        'text-right p-4 rounded-xl border-2 transition-all',
                        general.vatCalculationMode === 'tax_on_net'
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-gray-200 bg-white hover:border-gray-300',
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">موصى به</span>
                        {general.vatCalculationMode === 'tax_on_net' && <Check size={18} className="text-emerald-600" />}
                      </div>
                      <p className="font-bold text-sm mb-1">ضريبة على الصافي (بعد الخصم)</p>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        تُحتسب الضريبة على المبلغ بعد خصم الفاتورة.
                        <br />مطابق لقانون ضريبة القيمة المضافة المصري 67/2016 والممارسات الحديثة في السعودية والإمارات.
                      </p>
                      <div className="mt-3 text-[11px] bg-gray-50 rounded p-2 font-mono leading-relaxed">
                        مثال: 1000 × خصم 10% = 900<br />
                        الضريبة 14%: 900 × 0.14 = 126<br />
                        <span className="font-bold">الإجمالي: 1026 ج.م</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setGeneral(p => ({ ...p, vatCalculationMode: 'tax_on_gross' }))}
                      className={clsx(
                        'text-right p-4 rounded-xl border-2 transition-all',
                        general.vatCalculationMode === 'tax_on_gross'
                          ? 'border-amber-500 bg-amber-50'
                          : 'border-gray-200 bg-white hover:border-gray-300',
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">إعدادات قديمة</span>
                        {general.vatCalculationMode === 'tax_on_gross' && <Check size={18} className="text-amber-600" />}
                      </div>
                      <p className="font-bold text-sm mb-1">ضريبة على الإجمالي (قبل الخصم)</p>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        تُحتسب الضريبة على المبلغ الأصلي قبل تطبيق خصم الفاتورة.
                        <br />استخدم هذا الخيار فقط إذا كان نظامك المحاسبي السابق يعمل بهذه الطريقة.
                      </p>
                      <div className="mt-3 text-[11px] bg-gray-50 rounded p-2 font-mono leading-relaxed">
                        مثال: الضريبة 14% × 1000 = 140<br />
                        الخصم 10% × 1000 = 100<br />
                        <span className="font-bold">الإجمالي: 1040 ج.م</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {savedSection === 'general' ? (
            <div className="flex justify-end pt-4 mt-2">
              <span className="inline-flex items-center gap-1.5 text-emerald-700 text-sm font-semibold"><Check size={14} /> تم الحفظ</span>
            </div>
          ) : (
            <SaveButton loading={saveMut.isPending && activeSection === 'general'} onClick={() => {
              const { vatCalculationMode, taxRegistrationNumber, vatRate, ...flat } = general
              save('general', {
                ...flat,
                taxSettings: { vatCalculationMode, taxRegistrationNumber, vatRate },
              } as Partial<PharmacySettingsData>)
            }} />
          )}
        </SectionCard>

        {/* ── 2. Pharmacy Profile ─────────────────────────────────────────────── */}
        <SectionCard id="profile"
          title="بيانات الصيدلية"
          desc="المعلومات الأساسية لصيدليتك — تُستخدم في الإيصالات وملف البائع وغيرها"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={FIELD}>اسم الصيدلية (عربي)</label>
              <input value={profile.pharmacyNameAr} onChange={e => setProfile(p => ({ ...p, pharmacyNameAr: e.target.value }))} placeholder="مثال: صيدلية النيل" className={INPUT} />
            </div>
            <div>
              <label className={FIELD}>اسم الصيدلية (إنجليزي)</label>
              <input dir="ltr" value={profile.pharmacyNameEn} onChange={e => setProfile(p => ({ ...p, pharmacyNameEn: e.target.value }))} placeholder="e.g. Nile Pharmacy" className={INPUT} />
            </div>
            <div>
              <label className={FIELD}>رقم الترخيص</label>
              <input dir="ltr" value={profile.licenseNumber} onChange={e => setProfile(p => ({ ...p, licenseNumber: e.target.value }))} placeholder="LIC-2024-XXXXX" className={INPUT} />
            </div>
            <div>
              <label className={FIELD}>نوع الصيدلية</label>
              <select value={profile.pharmacyType} onChange={e => setProfile(p => ({ ...p, pharmacyType: e.target.value }))} className={SELECT}>
                <option value="retail">صيدلية تجزئة</option>
                <option value="hospital">صيدلية مستشفى</option>
                <option value="chain">سلسلة صيدليات</option>
                <option value="wholesale">توزيع بالجملة</option>
              </select>
            </div>
            <div>
              <label className={FIELD}>رقم الهاتف</label>
              <div className="relative">
                <Phone size={14} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input dir="ltr" value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="+20 10 XXXX XXXX" className={INPUT + ' ps-9'} />
              </div>
            </div>
            <div>
              <label className={FIELD}>البريد الإلكتروني</label>
              <div className="relative">
                <Mail size={14} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input dir="ltr" value={profile.contactEmail} onChange={e => setProfile(p => ({ ...p, contactEmail: e.target.value }))} placeholder="pharmacy@example.com" className={INPUT + ' ps-9'} />
              </div>
            </div>
            <div>
              <label className={FIELD}>الدولة</label>
              <select value={profile.country} onChange={e => setProfile(p => ({ ...p, country: e.target.value }))} className={SELECT}>
                <option value="">اختر الدولة</option>
                <option value="EG">مصر</option>
                <option value="SA">السعودية</option>
                <option value="AE">الإمارات</option>
                <option value="KW">الكويت</option>
                <option value="QA">قطر</option>
                <option value="BH">البحرين</option>
                <option value="OM">عُمان</option>
              </select>
            </div>
            <div>
              <label className={FIELD}>المدينة</label>
              <input value={profile.city} onChange={e => setProfile(p => ({ ...p, city: e.target.value }))} placeholder="القاهرة" className={INPUT} />
            </div>
            <div>
              <label className={FIELD}>المنطقة / الحي</label>
              <input value={profile.region} onChange={e => setProfile(p => ({ ...p, region: e.target.value }))} placeholder="مصر الجديدة" className={INPUT} />
            </div>
            <div>
              <label className={FIELD}>العنوان التفصيلي</label>
              <input value={profile.address} onChange={e => setProfile(p => ({ ...p, address: e.target.value }))} placeholder="123 شارع التحرير" className={INPUT} />
            </div>
          </div>

          <div className="mt-5">
            <label className={FIELD}>إحداثيات GPS (اختياري)</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MapPin size={14} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input dir="ltr" value={profile.gpsLocation} onChange={e => setProfile(p => ({ ...p, gpsLocation: e.target.value }))} placeholder="30.0444, 31.2357" className={INPUT + ' ps-9'} />
              </div>
              <a
                href={`https://maps.google.com/maps?q=${profile.gpsLocation || '30.0444,31.2357'}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors shrink-0"
              >
                <ExternalLink size={13} />
                خرائط
              </a>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">استخدم خرائط جوجل للحصول على الإحداثيات — ضرورية لميزة التبادل بين الصيدليات</p>
          </div>

          {savedSection === 'profile' ? (
            <div className="flex justify-end pt-4 mt-2">
              <span className="inline-flex items-center gap-1.5 text-emerald-700 text-sm font-semibold"><Check size={14} /> تم الحفظ</span>
            </div>
          ) : (
            <SaveButton loading={saveMut.isPending} onClick={() => save('profile', { ...profile })} />
          )}
        </SectionCard>

        {/* ── 3. Receipt Settings ─────────────────────────────────────────────── */}
        <SectionCard id="receipt"
          title="إعدادات الإيصال"
          desc="تخصيص الرأس والتذييل وإعدادات الطباعة للإيصالات"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-5">
              <div>
                <label className={FIELD}>رأس الإيصال</label>
                <input value={receipt.headerText} onChange={e => setReceipt(p => ({ ...p, headerText: e.target.value }))} placeholder="اسم الصيدلية أو شعار" className={INPUT} />
                <p className="text-xs text-gray-400 mt-1">يظهر في أعلى كل إيصال (50 حرفاً كحد أقصى)</p>
              </div>
              <div>
                <label className={FIELD}>نص أسفل الإيصال</label>
                <input value={receipt.footerText} onChange={e => setReceipt(p => ({ ...p, footerText: e.target.value }))} placeholder="شكراً لزيارتكم · ارجع في غضون 7 أيام" className={INPUT} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={FIELD}>لغة الإيصال</label>
                  <select value={receipt.language} onChange={e => setReceipt(p => ({ ...p, language: e.target.value as any }))} className={SELECT}>
                    <option value="ar">العربية</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div>
                  <label className={FIELD}>حجم الطباعة</label>
                  <select value={receipt.paperSize} onChange={e => setReceipt(p => ({ ...p, paperSize: e.target.value as any }))} className={SELECT}>
                    <option value="80mm">80mm (حراري)</option>
                    <option value="58mm">58mm (صغير)</option>
                    <option value="A4">A4 (ورق عادي)</option>
                  </select>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-0">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">ما يظهر في الإيصال</p>
                <Toggle checked={receipt.showLogo} onChange={v => setReceipt(p => ({ ...p, showLogo: v }))} label="إظهار الشعار" />
                <Toggle checked={receipt.showAddress} onChange={v => setReceipt(p => ({ ...p, showAddress: v }))} label="إظهار العنوان" />
                <Toggle checked={receipt.showPhone} onChange={v => setReceipt(p => ({ ...p, showPhone: v }))} label="إظهار رقم الهاتف" />
                <Toggle checked={receipt.showTaxNumber} onChange={v => setReceipt(p => ({ ...p, showTaxNumber: v }))} label="إظهار الرقم الضريبي" />
              </div>
            </div>

            {/* Live preview */}
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider self-start">معاينة مباشرة</p>
              <ReceiptPreview
                header={receipt.headerText || 'اسم الصيدلية'}
                footer={receipt.footerText}
                showPhone={receipt.showPhone}
                showAddress={receipt.showAddress}
                showTaxNumber={receipt.showTaxNumber}
                size={receipt.paperSize}
              />
              <p className="text-xs text-gray-400">حجم {receipt.paperSize}</p>
            </div>
          </div>

          {savedSection === 'receipt' ? (
            <div className="flex justify-end pt-4 mt-2">
              <span className="inline-flex items-center gap-1.5 text-emerald-700 text-sm font-semibold"><Check size={14} /> تم الحفظ</span>
            </div>
          ) : (
            <SaveButton loading={saveMut.isPending} onClick={() => save('receipt', { receiptSettings: receipt })} />
          )}
        </SectionCard>

        {/* ── 4. Label Settings ──────────────────────────────────────────────── */}
        <SectionCard id="labels"
          title="إعدادات الملصقات"
          desc="تخصيص نماذج ملصقات الباركود للمنتجات"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* ── Left: controls ── */}
            <div className="space-y-6">

              {/* Barcode type visual picker */}
              <div>
                <label className={FIELD}>نوع الباركود</label>
                <p className="text-xs text-gray-400 mb-3">اختر النوع الذي يناسب منتجاتك — كل نوع له شكل مختلف كما يظهر أدناه</p>
                <div className="space-y-2">
                  {BARCODE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setLabels(p => ({ ...p, barcodeType: opt.value }))}
                      className={clsx(
                        'w-full flex items-center gap-4 p-3 rounded-xl border-2 text-start transition-all',
                        labels.barcodeType === opt.value
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
                      )}
                    >
                      {/* mini barcode preview */}
                      <div className={clsx(
                        'w-20 shrink-0 rounded overflow-hidden p-1',
                        labels.barcodeType === opt.value ? 'text-emerald-700' : 'text-gray-700',
                      )}>
                        <BarcodeSvg bars={opt.bars} hasDigits={'hasDigits' in opt ? opt.hasDigits : false} height={22} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900">{opt.label}</span>
                          {'recommended' in opt && opt.recommended && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded">موصى به</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                      </div>
                      <div className={clsx(
                        'w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                        labels.barcodeType === opt.value ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300',
                      )}>
                        {labels.barcodeType === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Label size visual picker */}
              <div>
                <label className={FIELD}>حجم الملصق</label>
                <p className="text-xs text-gray-400 mb-3">اختر الحجم الافتراضي — الشكل الموضح يعكس النسبة الحقيقية للملصق</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {LABEL_SIZES.map(sz => (
                    <button
                      key={sz.value}
                      type="button"
                      onClick={() => setLabels(p => ({ ...p, defaultSize: sz.value }))}
                      className={clsx(
                        'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all',
                        labels.defaultSize === sz.value
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-gray-200 bg-white hover:border-gray-300',
                      )}
                    >
                      {/* proportional rectangle */}
                      <div className="flex items-end justify-center h-12">
                        <div
                          className={clsx(
                            'border-2 rounded flex items-center justify-center',
                            labels.defaultSize === sz.value ? 'border-emerald-500 bg-emerald-100' : 'border-gray-400 bg-gray-100',
                          )}
                          style={{ width: sz.w * 0.7, height: sz.h * 0.7 }}
                        >
                          {sz.value === 'custom' && <span className="text-[8px] text-gray-400">✏️</span>}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center gap-1 justify-center">
                          <span className="text-xs font-bold text-gray-900">{sz.label}</span>
                          {'recommended' in sz && sz.recommended && (
                            <span className="px-1 py-0.5 text-[8px] font-bold bg-emerald-100 text-emerald-700 rounded">افتراضي</span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">{sz.dims}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Barcode height */}
              <div>
                <label className={FIELD}>ارتفاع الباركود: <span className="text-emerald-600 font-bold">{labels.barcodeHeight} mm</span></label>
                <input
                  type="range" min={20} max={80} step={5}
                  value={labels.barcodeHeight}
                  onChange={e => setLabels(p => ({ ...p, barcodeHeight: Number(e.target.value) }))}
                  className="w-full accent-emerald-600"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>20mm صغير</span><span>80mm كبير</span>
                </div>
              </div>

              {/* Toggles */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">البيانات الظاهرة في الملصق</p>
                <Toggle checked={labels.showPharmacyName} onChange={v => setLabels(p => ({ ...p, showPharmacyName: v }))} label="اسم الصيدلية" />
                <Toggle checked={labels.showProductName} onChange={v => setLabels(p => ({ ...p, showProductName: v }))} label="اسم المنتج" />
                <Toggle checked={labels.showPrice} onChange={v => setLabels(p => ({ ...p, showPrice: v }))} label="السعر" />
                <Toggle checked={labels.showBarcode} onChange={v => setLabels(p => ({ ...p, showBarcode: v }))} label="الباركود" />
                <Toggle checked={labels.showExpiry} onChange={v => setLabels(p => ({ ...p, showExpiry: v }))} label="تاريخ الانتهاء" />
                <Toggle checked={labels.showUom} onChange={v => setLabels(p => ({ ...p, showUom: v }))} label="وحدة القياس" />
                <Toggle checked={labels.showTax} onChange={v => setLabels(p => ({ ...p, showTax: v }))} label="الضريبة" />
              </div>
            </div>

            {/* ── Right: live label preview ── */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">معاينة الملصق</p>
              <div className="flex flex-col items-center gap-3">
                {/* label card */}
                <div
                  className="bg-white border-2 border-dashed border-gray-300 rounded-xl shadow-sm flex flex-col p-3 gap-1.5 font-sans transition-all"
                  style={{ width: 140, minHeight: 100 }}
                >
                  {labels.showPharmacyName && (
                    <p className="text-[8px] text-gray-500 text-center border-b border-gray-100 pb-1">صيدلية النيل</p>
                  )}
                  {labels.showProductName && (
                    <p className="text-[10px] font-bold text-gray-900 text-center leading-tight">باناكول 500ملجم</p>
                  )}
                  {(labels.showPrice || labels.showUom) && (
                    <div className="flex items-center justify-between text-[8px] text-gray-600">
                      {labels.showPrice  && <span className="font-bold text-emerald-700">25.00 ج.م</span>}
                      {labels.showUom    && <span className="text-gray-400">علبة / 20 قرص</span>}
                    </div>
                  )}
                  {labels.showExpiry && (
                    <p className="text-[8px] text-orange-600 text-center">ينتهي: 2027/06/30</p>
                  )}
                  {labels.showTax && (
                    <p className="text-[7px] text-gray-400 text-center">ض.ق.م: 14٪</p>
                  )}
                  {labels.showBarcode && (
                    <div className="mt-1 text-gray-800" style={{ height: Math.round(labels.barcodeHeight * 0.5) }}>
                      <BarcodeSvg
                        bars={BARCODE_OPTIONS.find(o => o.value === labels.barcodeType)?.bars ?? BARCODE_OPTIONS[0].bars}
                        hasDigits={labels.barcodeType === 'EAN13'}
                        height={Math.round(labels.barcodeHeight * 0.45)}
                      />
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-gray-600">
                    {LABEL_SIZES.find(s => s.value === labels.defaultSize)?.dims ?? ''}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    باركود {BARCODE_OPTIONS.find(o => o.value === labels.barcodeType)?.label}
                  </p>
                </div>
                <p className="text-[10px] text-gray-400 text-center max-w-[140px]">
                  المعاينة تتغير تلقائياً مع كل تعديل تقوم به
                </p>
              </div>
            </div>
          </div>

          {savedSection === 'labels' ? (
            <div className="flex justify-end pt-4 mt-2">
              <span className="inline-flex items-center gap-1.5 text-emerald-700 text-sm font-semibold"><Check size={14} /> تم الحفظ</span>
            </div>
          ) : (
            <SaveButton loading={saveMut.isPending} onClick={() => save('labels', { labelSettings: labels })} />
          )}
        </SectionCard>

        {/* ── 5. Users ────────────────────────────────────────────────────────── */}
        <SectionCard id="users"
          title="إعدادات المستخدمين"
          desc="إدارة أعضاء الفريق والأدوار والصلاحيات"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">أعضاء الفريق المرتبطون بهذه الصيدلية</p>
          </div>
          <div className="p-6 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
            <Users size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-medium text-gray-600 mb-1">إدارة المستخدمين متاحة من لوحة المشرف</p>
            <p className="text-xs text-gray-400 mb-3">يمكنك إضافة مستخدمين، تغيير أدوارهم، أو إيقاف حساباتهم</p>
            <Link
              to="/admin/users"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors"
            >
              <Users size={13} />
              إدارة المستخدمين
              <ExternalLink size={11} />
            </Link>
          </div>
        </SectionCard>

        {/* ── 6. Inventory Settings ────────────────────────────────────────────── */}
        <SectionCard id="inventory"
          title="إعدادات المخزون"
          desc="إدارة المستودعات، الحدود الدنيا، وتنبيهات انتهاء الصلاحية"
        >
          {/* Warehouses */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-bold text-gray-900">إدارة مواقع المستودعات</p>
                <p className="text-xs text-gray-400 mt-0.5">{warehouses.length} موقع مسجّل</p>
              </div>
              <button
                onClick={() => setWhModal('new')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors"
              >
                <Plus size={13} /> إضافة موقع
              </button>
            </div>
            {warehouses.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-400 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                لا توجد مستودعات — أضف موقعك الأول
              </div>
            ) : (
              <div className="space-y-2">
                {warehouses.map(wh => (
                  <WarehouseRow
                    key={wh.id}
                    wh={wh}
                    onEdit={() => setWhModal(wh)}
                    onDelete={() => deleteWhMut.mutate(wh.id)}
                    onToggle={() => updateWhMut.mutate({ id: wh.id, data: { isActive: !wh.isActive } })}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Expiry toggle */}
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl mb-6">
            <Toggle
              checked={invSettings.disableExpiryForNewBatches}
              onChange={v => setInvSettings(p => ({ ...p, disableExpiryForNewBatches: v }))}
              label="تعطيل تاريخ انتهاء الصلاحية للدفعات الجديدة"
              desc="عند التفعيل، سيتم تعطيل تواريخ انتهاء الصلاحية لجميع دفعات المنتجات الجديدة. بينما ستحتفظ الدفعات الحالية بتواريخها الخاصة."
            />
          </div>

          {/* Reorder settings */}
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 mb-1">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">إعادة التخزين والتنبيهات</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={FIELD}>أيام إعادة التخزين</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} max={365} value={invSettings.reorderDays}
                    onChange={e => setInvSettings(p => ({ ...p, reorderDays: Number(e.target.value) }))} className={INPUT} />
                  <span className="text-sm text-gray-400 shrink-0">يوم</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">أيام المهلة المطلوبة لإعادة التخزين قبل تفعيل التنبيه</p>
              </div>
              <div>
                <label className={FIELD}>مخزون الأمان (%)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={100} value={invSettings.safetyStockPct}
                    onChange={e => setInvSettings(p => ({ ...p, safetyStockPct: Number(e.target.value) }))} className={INPUT} />
                  <span className="text-sm text-gray-400 shrink-0">%</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">% من المخزون الاحتياطي كحد أمان قبل التنبيه</p>
              </div>
              <div>
                <label className={FIELD}>فترة تنبيه انتهاء الصلاحية</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={7} max={365} value={invSettings.expiryAlertDays}
                    onChange={e => setInvSettings(p => ({ ...p, expiryAlertDays: Number(e.target.value) }))} className={INPUT} />
                  <span className="text-sm text-gray-400 shrink-0">يوم</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">عدد الأيام قبل انتهاء الصلاحية لتفعيل التنبيه</p>
              </div>
              <div>
                <label className={FIELD}>نوع توصية إعادة التخزين</label>
                <select value={invSettings.reorderRecommendationType}
                  onChange={e => setInvSettings(p => ({ ...p, reorderRecommendationType: e.target.value as any }))} className={SELECT}>
                  <option value="to_safety_stock">حتى مخزون الأمان</option>
                  <option value="to_max">حتى المخزون الأقصى</option>
                  <option value="fixed_qty">كمية ثابتة</option>
                </select>
              </div>
            </div>
          </div>

          {savedSection === 'inventory' ? (
            <div className="flex justify-end pt-4 mt-2">
              <span className="inline-flex items-center gap-1.5 text-emerald-700 text-sm font-semibold"><Check size={14} /> تم الحفظ</span>
            </div>
          ) : (
            <SaveButton loading={saveMut.isPending} onClick={() => save('inventory', { inventorySettings: invSettings })} />
          )}
        </SectionCard>

        {/* ── 7. Seller Settings ──────────────────────────────────────────────── */}
        <SectionCard id="seller"
          title="إعدادات البائع"
          desc="ملف البائع في تبادل الصيدليات، مناطق التوصيل، والتشغيل التلقائي"
        >
          <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 flex items-start gap-4">
            <div className="p-2.5 bg-emerald-600 rounded-xl shrink-0">
              <Store size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">إعدادات البائع في تبادل الصيدليات (PEN)</p>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                يمكنك إدارة ملفك كبائع — الاسم القانوني، مناطق التوصيل، التشغيل التلقائي، وتفضيلات الإشعارات — من صفحة تبادل الصيدليات مباشرة.
              </p>
              <Link
                to="/pharmacy/p2p?tab=profile"
                className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 text-sm font-semibold text-emerald-700 border border-emerald-300 bg-white hover:bg-emerald-50 rounded-xl transition-colors"
              >
                <Store size={13} />
                فتح إعدادات البائع
                <ChevronRight size={13} />
              </Link>
            </div>
          </div>
        </SectionCard>

        {/* ── 8. Additional Settings ──────────────────────────────────────────── */}
        <SectionCard id="extra"
          title="إعدادات إضافية"
          desc="تفضيلات الإشعارات، تصدير البيانات، والخصوصية"
        >
          <div className="space-y-4">
            {/* Notification preferences */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Bell size={15} className="text-gray-500" />
                <p className="text-sm font-bold text-gray-900">تفضيلات الإشعارات</p>
              </div>
              <div className="space-y-3">

                {/* Inventory alerts */}
                <div className="p-4 bg-white rounded-xl border border-gray-200 border-l-4 border-l-red-400">
                  <p className="text-xs font-bold text-gray-700 mb-0.5">📦 تنبيهات المخزون</p>
                  <p className="text-xs text-gray-400 mb-3">إشعارات نقص الكميات وانتهاء الصلاحية والمنتجات الراكدة</p>
                  <NotifToggle checked={notifSettings.enableLowStockAlerts} onChange={v => setNotifSettings(s => ({ ...s, enableLowStockAlerts: v }))} label="نقص المخزون" desc="عند انخفاض كمية منتج عن الحد الأدنى المضبوط" freq="فوري" freqColor="red" />
                  <NotifToggle checked={notifSettings.enableExpiryAlerts} onChange={v => setNotifSettings(s => ({ ...s, enableExpiryAlerts: v }))} label="تنبيهات الصلاحية" desc="منتجات قريبة الانتهاء أو منتهية الصلاحية في المخزون" freq="يومياً" freqColor="orange" />
                  <NotifToggle checked={notifSettings.enableDeadStockAlerts} onChange={v => setNotifSettings(s => ({ ...s, enableDeadStockAlerts: v }))} label="المخزون الراكد" desc="منتجات لم تُباع خلال الفترة المحددة في إعدادات الذكاء" freq="يومياً" freqColor="orange" />
                </div>

                {/* Marketplace alerts */}
                <div className="p-4 bg-white rounded-xl border border-gray-200 border-l-4 border-l-violet-400">
                  <p className="text-xs font-bold text-gray-700 mb-0.5">🔄 سوق التبادل</p>
                  <p className="text-xs text-gray-400 mb-3">إشعارات الطلبات والفرص الذكية وعروض التصفية</p>
                  <NotifToggle checked={notifSettings.enableP2POrderAlerts} onChange={v => setNotifSettings(s => ({ ...s, enableP2POrderAlerts: v }))} label="طلبات P2P" desc="تنبيهات الطلبات المعلقة والمتأخرة بين الصيدليات" freq="فوري" freqColor="red" />
                  <NotifToggle checked={notifSettings.enableSmartProcurementAlerts} onChange={v => setNotifSettings(s => ({ ...s, enableSmartProcurementAlerts: v }))} label="فرص الشراء الذكي" desc="عروض بأسعار أفضل من صيدليات الشبكة رصدها النظام" freq="يومياً" freqColor="orange" />
                  <NotifToggle checked={notifSettings.enableClearanceAlerts} onChange={v => setNotifSettings(s => ({ ...s, enableClearanceAlerts: v }))} label="عروض التصفية" desc="منتجات قريبة الانتهاء متاحة للشراء بخصم من شبكتك" freq="فوري" freqColor="red" />
                </div>

                {/* POS alerts */}
                <div className="p-4 bg-white rounded-xl border border-gray-200 border-l-4 border-l-rose-400">
                  <p className="text-xs font-bold text-gray-700 mb-0.5">💰 الكاشير</p>
                  <p className="text-xs text-gray-400 mb-3">إشعارات سلامة نقاط البيع والمخالفات</p>
                  <NotifToggle checked={notifSettings.enablePosIntegrityAlerts} onChange={v => setNotifSettings(s => ({ ...s, enablePosIntegrityAlerts: v }))} label="تنبيهات سلامة الكاشير" desc="فجوات في المبيعات أو مخالفات في تسجيل المعاملات" freq="فوري" freqColor="red" />
                </div>

                {/* AI assistant alerts */}
                <div className="p-4 bg-white rounded-xl border border-gray-200 border-l-4 border-l-emerald-400">
                  <p className="text-xs font-bold text-gray-700 mb-0.5">🤖 المساعد الذكي</p>
                  <p className="text-xs text-gray-400 mb-3">الملخص اليومي وتحليلات الذكاء الاصطناعي</p>
                  <NotifToggle checked={notifSettings.enableMorningBriefing} onChange={v => setNotifSettings(s => ({ ...s, enableMorningBriefing: v }))} label="تقرير الصباح" desc="ملخص يومي بأهم مؤشرات الصيدلية عند بداية كل يوم" freq="يومياً" freqColor="emerald" />
                </div>

              </div>
              <SaveButton loading={saveMut.isPending} onClick={() => save('extra', { notificationSettings: notifSettings })} />
            </div>

            {/* Data export */}
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={15} className="text-gray-500" />
                <p className="text-sm font-bold text-gray-900">تصدير البيانات</p>
              </div>
              <p className="text-xs text-gray-500 mb-3">تصدير بيانات المخزون والطلبات والتقارير بصيغة Excel أو CSV</p>
              <div className="flex gap-2 flex-wrap">
                <Link to="/pharmacy/inventory" className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors">
                  <Package size={12} /> تصدير المخزون
                </Link>
                <Link to="/pharmacy/orders" className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-purple-700 border border-purple-200 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors">
                  <Receipt size={12} /> تصدير الطلبات
                </Link>
                <Link to="/pharmacy/analytics" className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-teal-700 border border-teal-200 bg-teal-50 hover:bg-teal-100 rounded-xl transition-colors">
                  <FileText size={12} /> تقارير التحليلات
                </Link>
              </div>
            </div>

            {/* Security */}
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <Shield size={15} className="text-gray-500" />
                <p className="text-sm font-bold text-gray-900">الأمان والخصوصية</p>
              </div>
              <p className="text-xs text-gray-500">
                تتم إدارة الأمان والمصادقة والصلاحيات عبر نظام الهوية المركزي.
                للتغييرات المتعلقة بكلمة المرور أو المصادقة الثنائية، تواصل مع مشرف النظام.
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── Warehouse modal ────────────────────────────────────────────────────── */}
      {whModal && (
        <WarehouseModal
          wh={whModal === 'new' ? null : whModal}
          onClose={() => setWhModal(null)}
          onSave={data => {
            if (whModal === 'new') {
              createWhMut.mutate(data, { onSuccess: () => setWhModal(null) })
            } else {
              updateWhMut.mutate({ id: (whModal as WarehouseType).id, data }, { onSuccess: () => setWhModal(null) })
            }
          }}
        />
      )}
    </div>
  )
}
