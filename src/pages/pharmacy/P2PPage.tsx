import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import {
  Store, Search, Plus, Package, ShoppingCart, Settings,
  Star, MapPin, Clock, ChevronRight, ChevronLeft, AlertCircle, AlertTriangle, CheckCircle2,
  Flame, Zap, Shield, ArrowRight, Eye, X, Check, RefreshCw,
  FileText, XCircle, Filter, Loader2, TrendingDown, Award,
  Sparkles, TrendingUp, BarChart2, DollarSign,
  Rocket, Globe, Bell, Truck, Target, Link2,
  Upload, User, HelpCircle, Calendar, ChevronDown, Receipt,
} from 'lucide-react'
import { p2pSellerApi, p2pListingApi, p2pMarketplaceApi, p2pOrdersApi } from '../../api/p2p.api'
import { VoiceMicButton } from '../../components/ui/VoiceMicButton'
import { pharmacySettingsApi } from '../../api/pharmacy-settings.api'
import { useCurrency } from '../../hooks/useCurrency'
import { inventoryApi } from '../../api/inventory.api'
import type { InventoryItem } from '../../types'
import { ProductRulesPanel } from '../../components/p2p/ProductRulesPanel'
import { LegalDeclarationModal } from '../../components/p2p/LegalDeclarationModal'
import { SpotlightGuide } from '../../components/p2p/SpotlightGuide'
import { EmergencyFinderSheet } from '../../components/p2p/EmergencyFinderSheet'
import { PriceTrendPanel } from '../../components/ui/PriceTrendPanel'
import { TabBar } from '../../components/ui/TabBar'
import type { Guide } from '../../components/p2p/SpotlightGuide'
import client from '../../api/client'
import { useProfileStore } from '../../store/auth.store'
import type {
  SellerProfile, P2pListing, MarketplaceResult,
  P2pOrder, EnrichedP2pOrder, TrustLevel, ListingType, ExpiryAlert,
  ProcurementOpportunity, MarketIntelligence,
} from '../../types/p2p'

// ── Countdown hook ────────────────────────────────────────────────────────────
function useCountdown(expiresAt?: string | null) {
  const [remaining, setRemaining] = useState<number | null>(null)
  useEffect(() => {
    if (!expiresAt) { setRemaining(null); return }
    const tick = () => setRemaining(new Date(expiresAt).getTime() - Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])
  if (remaining === null) return null
  if (remaining <= 0) return { expired: true, display: '00:00', urgent: true }
  const mins = Math.floor(remaining / 60_000)
  const secs = Math.floor((remaining % 60_000) / 1000)
  return {
    expired: false,
    display: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
    urgent: remaining < 10 * 60_000,
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = ['marketplace', 'sell', 'orders', 'profile', 'insights'] as const
type Tab = typeof TABS[number]

// ── Helpers ───────────────────────────────────────────────────────────────────

const INPUT = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white'

function daysLeft(date?: string | null): number | null {
  if (!date) return null
  return Math.floor((new Date(date).getTime() - Date.now()) / 86_400_000)
}

function TrustBadge({ level }: { level?: TrustLevel }) {
  if (!level) return null
  const cfg: Record<TrustLevel, { label: string; cls: string }> = {
    bronze:   { label: '🥉 برونزي',  cls: 'bg-amber-100 text-amber-700' },
    silver:   { label: '🥈 فضي',    cls: 'bg-gray-100 text-gray-700' },
    gold:     { label: '🥇 ذهبي',   cls: 'bg-yellow-100 text-yellow-700' },
    platinum: { label: '💎 بلاتيني', cls: 'bg-purple-100 text-purple-700' },
  }
  const { label, cls } = cfg[level]
  return <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-semibold', cls)}>{label}</span>
}

function ListingTypeBadge({ type }: { type: ListingType }) {
  if (type === 'clearance') return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">
      <Flame size={10} /> تخفيض
    </span>
  )
  if (type === 'emergency') return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
      <Zap size={10} /> متاح الآن
    </span>
  )
  return null
}

function OrderStatusBadge({ status, isRTL }: { status: P2pOrder['status']; isRTL: boolean }) {
  const cfg = {
    pending:   { cls: 'bg-yellow-100 text-yellow-700',   ar: 'في انتظار البائع',  en: 'Awaiting Seller' },
    accepted:  { cls: 'bg-blue-100 text-blue-700',       ar: 'قيد المعالجة',       en: 'Processing' },
    shipped:   { cls: 'bg-indigo-100 text-indigo-700',   ar: 'تم الشحن',           en: 'Shipped' },
    rejected:  { cls: 'bg-red-100 text-red-700',         ar: 'رفضه البائع',        en: 'Rejected' },
    completed: { cls: 'bg-emerald-100 text-emerald-700', ar: 'مكتمل',              en: 'Completed' },
    cancelled: { cls: 'bg-gray-100 text-gray-600',       ar: 'ملغي',               en: 'Cancelled' },
  }
  const { cls, ar, en } = cfg[status]
  return <span className={clsx('text-xs px-2.5 py-1 rounded-full font-semibold', cls)}>{isRTL ? ar : en}</span>
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function P2PPage() {
  const { t, i18n } = useTranslation()
  const isRTL = i18n.language.startsWith('ar')
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()

  const activeTab = (searchParams.get('tab') as Tab) ?? 'marketplace'
  const setTab = (tab: Tab) => setSearchParams({ tab }, { replace: true })

  const [showLegal, setShowLegal] = useState(false)
  const [pendingPublish, setPendingPublish] = useState<(() => void) | null>(null)
  const [showQuickStart, setShowQuickStart] = useState(false)

  // ── Check if legal ack needed ──────────────────────────────────────────────
  const { data: sellerProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['p2p-seller-profile'],
    queryFn: p2pSellerApi.getProfile,
    staleTime: 5 * 60_000,
    retry: 2,
  })

  // ── Badge: procurement opportunities count ─────────────────────────────────
  const { data: procOpps } = useQuery({
    queryKey: ['p2p-procurement-opportunities'],
    queryFn: () => p2pMarketplaceApi.getProcurementOpportunities({ limit: 50 }),
    staleTime: 5 * 60_000,
    enabled: activeTab !== 'insights', // stop fetching once they're viewing the tab
  })

  // ── Badge: pending orders requiring action ─────────────────────────────────
  const { data: pendingOrdersData } = useQuery({
    queryKey: ['p2p-orders-pending-badge'],
    queryFn: () => p2pOrdersApi.list({ role: 'both', status: 'pending', limit: 1, offset: 0 }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: activeTab !== 'orders',
  })
  const pendingOrdersCount = pendingOrdersData?.total ?? 0

  const needsLegalAck = useCallback((): boolean => {
    if (!sellerProfile) return false  // still loading — don't fire modal yet
    // Auto-created profiles (empty legalName) need profile setup, not legal ack
    if (!sellerProfile.legalName?.trim()) return false
    if (!sellerProfile.lastLegalAckAt) return true
    const days = (Date.now() - new Date(sellerProfile.lastLegalAckAt).getTime()) / 86_400_000
    return days >= 90
  }, [sellerProfile])

  const guardPublish = useCallback((action: () => void) => {
    if (needsLegalAck()) {
      setPendingPublish(() => action)
      setShowLegal(true)
    } else {
      action()
    }
  }, [needsLegalAck])

  // ── ProfileTab wizard navigation (used by spotlight guides) ─────────────────
  const profileTabApiRef = useRef<{ goToStep: (n: number) => void } | null>(null)

  // ── Spotlight Guide definitions ─────────────────────────────────────────────
  const spotlightGuides: Guide[] = [
    {
      id: 'add-listing',
      labelAr: 'أضف أول إعلان للبيع',
      labelEn: 'Add your first listing',
      emoji: '📦',
      steps: [
        {
          targetId: 'p2p-tab-sell',
          titleAr: 'انتقل لتبويب "أعرض للبيع"',
          titleEn: 'Go to the Sell tab',
          bodyAr: 'من هنا ستنشئ إعلاناتك وتعرض منتجاتك للصيدليات الأخرى في الشبكة.',
          bodyEn: 'This is where you create listings and sell to other pharmacies in the network.',
          beforeActivate: () => setTab('sell'),
        },
        {
          targetId: 'p2p-add-listing-btn',
          titleAr: 'اضغط "إعلان جديد"',
          titleEn: 'Tap "New Listing"',
          bodyAr: 'اضغط هذا الزر لبدء إنشاء إعلانك الأول.',
          bodyEn: 'Press this button to start creating your first listing.',
        },
        {
          titleAr: 'اختر المنتج والسعر',
          titleEn: 'Select product & set price',
          bodyAr: 'ابحث في مخزونك عن المنتج الذي تريد بيعه، حدد الكمية والسعر، ثم اضغط نشر.',
          bodyEn: 'Search your inventory for the item, set quantity and price, then hit Publish.',
        },
      ],
    },
    {
      id: 'complete-profile',
      labelAr: 'أكمل ملف البائع',
      labelEn: 'Complete your seller profile',
      emoji: '🏪',
      steps: [
        {
          targetId: 'p2p-tab-profile',
          titleAr: 'انتقل لتبويب "ملفي كبائع"',
          titleEn: 'Go to Seller Profile',
          bodyAr: 'ملف البائع المكتمل يُعطيك أولوية في نتائج البحث ويبني الثقة مع المشترين.',
          bodyEn: 'A complete profile boosts your search ranking and builds buyer trust.',
          beforeActivate: () => setTab('profile'),
        },
        {
          targetId: 'p2p-profile-name',
          titleAr: 'أدخل الاسم القانوني للصيدلية',
          titleEn: 'Enter your pharmacy legal name',
          bodyAr: 'يجب أن يطابق الاسم المدوّن في الترخيص الصيدلاني.',
          bodyEn: 'Must match the name on your pharmacy license.',
          beforeActivate: () => profileTabApiRef.current?.goToStep(0),
          validate: () => !!((document.getElementById('p2p-profile-name') as HTMLInputElement | null)?.value?.trim()),
          validationMsgAr: 'أدخل الاسم القانوني للصيدلية للمتابعة',
          validationMsgEn: 'Enter the pharmacy legal name to continue',
        },
        {
          targetId: 'p2p-profile-gps',
          titleAr: 'أضف إحداثيات GPS',
          titleEn: 'Add your GPS coordinates',
          bodyAr: 'الإحداثيات تتيح للمشترين القريبين العثور عليك أولاً في نتائج البحث.',
          bodyEn: 'GPS coordinates help nearby buyers find you first in search results.',
          beforeActivate: () => profileTabApiRef.current?.goToStep(1),
          validate: () => !!((document.getElementById('p2p-profile-gps') as HTMLInputElement | null)?.value?.trim()),
          validationMsgAr: 'أدخل إحداثيات GPS للمتابعة',
          validationMsgEn: 'Enter GPS coordinates to continue',
        },
        {
          targetId: 'p2p-delivery-zones',
          titleAr: 'حدّد مناطق التوصيل',
          titleEn: 'Set your delivery zones',
          bodyAr: 'فعّل المناطق التي تغطيها وحدد سعر التوصيل أو اجعله مجاناً.',
          bodyEn: 'Enable zones you cover and set delivery prices or offer free delivery.',
          beforeActivate: () => profileTabApiRef.current?.goToStep(3),
        },
        {
          targetId: 'p2p-docs-section',
          titleAr: 'ارفع مستنداتك الرسمية',
          titleEn: 'Upload your official documents',
          bodyAr: 'رفع الترخيص والسجل التجاري يُسرّع التحقق ويمنحك شارة الموثق.',
          bodyEn: 'Uploading your license and commercial registration speeds up verification.',
          beforeActivate: () => profileTabApiRef.current?.goToStep(2),
        },
        {
          targetId: 'p2p-automation-section',
          titleAr: 'الأتمتة والإشعارات',
          titleEn: 'Automation & Notifications',
          bodyAr: 'فعّل الإدراج التلقائي لمنتجاتك القريبة من الانتهاء، وحدد الإشعارات التي تريدها.',
          bodyEn: 'Enable auto-listing for near-expiry products and choose which notifications to receive.',
          beforeActivate: () => profileTabApiRef.current?.goToStep(4),
        },
        {
          targetId: 'p2p-save-section',
          titleAr: 'احفظ ملفك واطلب التحقق',
          titleEn: 'Save & request verification',
          bodyAr: 'اضغط "حفظ الملف الشخصي" لإرسال ملفك للمراجعة. بعد التحقق تظهر إعلاناتك للجميع.',
          bodyEn: 'Press "Save Profile" to submit for admin review. Once verified, your listings go live.',
          beforeActivate: () => profileTabApiRef.current?.goToStep(5),
        },
      ],
    },
    {
      id: 'browse-market',
      labelAr: 'تصفح السوق واشترِ',
      labelEn: 'Browse & buy from market',
      emoji: '🛒',
      steps: [
        {
          targetId: 'p2p-tab-marketplace',
          titleAr: 'انتقل لتبويب "السوق"',
          titleEn: 'Go to Marketplace',
          bodyAr: 'هنا تجد منتجات معروضة للبيع من صيدليات أخرى في شبكتك.',
          bodyEn: 'Here you\'ll find products listed by other pharmacies in your network.',
          beforeActivate: () => setTab('marketplace'),
        },
        {
          targetId: 'p2p-search-input',
          titleAr: 'ابحث عن دواء أو مكمل',
          titleEn: 'Search for a medicine',
          bodyAr: 'اكتب اسم الدواء أو الباركود لإيجاد العروض المتاحة بأفضل الأسعار.',
          bodyEn: 'Type the medicine name or barcode to find available offers at the best price.',
        },
        {
          titleAr: 'اختر عرضاً واطلب',
          titleEn: 'Pick an offer and order',
          bodyAr: 'اضغط على بطاقة أي منتج، راجع تفاصيل البائع والسعر، ثم اضغط "اطلب الآن".',
          bodyEn: 'Click any product card, review the seller details and price, then tap "Order Now".',
        },
      ],
    },
    {
      id: 'track-orders',
      labelAr: 'تتبع طلباتي',
      labelEn: 'Track my orders',
      emoji: '📋',
      steps: [
        {
          targetId: 'p2p-tab-orders',
          titleAr: 'انتقل لتبويب "الطلبات"',
          titleEn: 'Go to Orders',
          bodyAr: 'هنا تتابع كل الطلبات سواء كنت مشترياً أو بائعاً.',
          bodyEn: 'Track all your orders here, whether you\'re buying or selling.',
          beforeActivate: () => setTab('orders'),
        },
        {
          titleAr: 'فرّق بين "مشترياتي" و"مبيعاتي"',
          titleEn: 'Filter buying vs. selling',
          bodyAr: 'استخدم الفلتر في الأعلى لعرض طلباتك كمشترٍ أو مبيعاتك كبائع منفصلاً.',
          bodyEn: 'Use the filter at the top to see your buying orders or selling orders separately.',
        },
      ],
    },
  ]

  type TabSubItem = { labelAr: string; labelEn: string; onClick: () => void }
  const tabs: Array<{ id: Tab; labelAr: string; labelEn: string; icon: React.ElementType; subItems?: TabSubItem[] }> = [
    {
      id: 'marketplace', labelAr: 'سوق الأدوية', labelEn: 'Marketplace', icon: Store,
      subItems: [
        { labelAr: 'تصفح المنتجات', labelEn: 'Browse Products', onClick: () => setTab('marketplace') },
        { labelAr: '⚡ أدوية عاجلة', labelEn: '⚡ Urgent Medicine', onClick: () => setTab('marketplace') },
      ],
    },
    {
      id: 'sell', labelAr: 'منتجاتي المدرجة للبيع', labelEn: 'My Listings', icon: Package,
      subItems: [
        { labelAr: 'إعلاناتي', labelEn: 'My Listings', onClick: () => setTab('sell') },
        { labelAr: '+ إضافة إعلان', labelEn: '+ New Listing', onClick: () => setSearchParams({ tab: 'sell', openAdd: '1' }) },
      ],
    },
    { id: 'orders',   labelAr: 'الطلبات',     labelEn: 'Orders',        icon: ShoppingCart },
    { id: 'insights', labelAr: 'ذكاء السوق',  labelEn: 'AI Insights',   icon: Sparkles },
    {
      id: 'profile', labelAr: 'ملفي كبائع', labelEn: 'Seller Profile', icon: Settings,
      subItems: [
        { labelAr: 'المعلومات العامة',     labelEn: 'General Info',     onClick: () => setSearchParams({ tab: 'profile', section: 'general' }) },
        { labelAr: 'مناطق التوصيل',       labelEn: 'Delivery Zones',   onClick: () => setSearchParams({ tab: 'profile', section: 'zones' }) },
        { labelAr: 'إعدادات الأتمتة',     labelEn: 'Automation',       onClick: () => setSearchParams({ tab: 'profile', section: 'automation' }) },
        { labelAr: 'تفضيلات الإشعارات',   labelEn: 'Notifications',    onClick: () => setSearchParams({ tab: 'profile', section: 'notifications' }) },
      ],
    },
  ]

  return (
    <div className={clsx('min-h-screen bg-gray-50', isRTL && 'font-arabic')}>
      {/* Legal modal */}
      <LegalDeclarationModal
        isOpen={showLegal}
        onConfirmed={() => {
          setShowLegal(false)
          if (pendingPublish) { pendingPublish(); setPendingPublish(null) }
        }}
        onCancelled={() => {
          setShowLegal(false)
          setPendingPublish(null)
        }}
      />

      {/* Quick Start Guide modal */}
      {showQuickStart && (
        <QuickStartGuide
          isRTL={isRTL}
          sellerProfile={sellerProfile}
          onClose={() => setShowQuickStart(false)}
          onNavigate={(tab) => { setTab(tab as Tab); setShowQuickStart(false) }}
          onShowLegal={() => { setShowQuickStart(false); setShowLegal(true) }}
        />
      )}

      {/* Spotlight Guide — floating "Guide Me" button + step overlays */}
      <SpotlightGuide guides={spotlightGuides} isRTL={isRTL} />

      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
              <Store size={20} className="text-emerald-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900">
                {isRTL ? 'شبكة تبادل الصيدليات' : 'Pharmacy Exchange Network'}
              </h1>
              <p className="text-sm text-gray-500">
                {isRTL
                  ? 'تبادل الأدوية بين الصيدليات واكتشف الفرص بذكاء وأمان'
                  : 'Trade medicines, discover smart procurement opportunities'}
              </p>
            </div>
          </div>

          {/* Quick Start button */}
          <button
            onClick={() => setShowQuickStart(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm shrink-0"
          >
            <Rocket size={15} />
            {isRTL ? 'دليل البدء' : 'Quick Start'}
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-5">
          <TabBar
            tabs={tabs.map(t => ({
              key: t.id,
              labelAr: t.labelAr,
              labelEn: t.labelEn,
              icon: t.icon,
              badge:
                t.id === 'insights' && activeTab !== 'insights' && procOpps?.length ? procOpps.length :
                t.id === 'orders' && activeTab !== 'orders' && pendingOrdersCount > 0 ? pendingOrdersCount :
                undefined,
            }))}
            active={activeTab}
            onChange={setTab}
            isRTL={isRTL}
            color="emerald"
          />
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {activeTab === 'marketplace' && <MarketplaceTab isRTL={isRTL} autoOpenEmergency={searchParams.get('emergency') === '1'} />}
        {activeTab === 'sell' && (
          <SellTab
            isRTL={isRTL}
            guardPublish={guardPublish}
            hasProfile={!!sellerProfile}
            profileLoading={profileLoading}
            sellerProfile={sellerProfile}
            onGoToProfile={() => setTab('profile')}
            autoOpenAdd={searchParams.get('openAdd') === '1'}
            initialItemId={searchParams.get('itemId') ?? undefined}
            nearExpiryPreset={searchParams.get('preset') === 'near_expiry'}
          />
        )}
        {activeTab === 'orders' && <OrdersTab isRTL={isRTL} />}
        {activeTab === 'insights' && <InsightsTab isRTL={isRTL} />}
        {activeTab === 'profile' && <ProfileTab isRTL={isRTL} sellerProfile={sellerProfile} onShowLegalAck={() => setShowLegal(true)} apiRef={profileTabApiRef} />}
      </div>
    </div>
  )
}

// ── MARKETPLACE TAB ───────────────────────────────────────────────────────────

function ResultGroup({ title, count, children }: {
  title: string; count: number; children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-bold text-gray-800">{title}</span>
        <span className="text-[11px] text-gray-400 font-medium">({count})</span>
        <div className="flex-1 h-px bg-gray-100 ms-1" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

function MarketplaceTab({ isRTL, autoOpenEmergency }: { isRTL: boolean; autoOpenEmergency?: boolean }) {
  const [q, setQ] = useState('')
  const [city, setCity] = useState('')
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [maxKm, setMaxKm] = useState<number | null>(null)
  const [minScore, setMinScore] = useState<number | null>(null)
  const [maxPrice, setMaxPrice] = useState<number>(10000)
  const [page, setPage] = useState(0)
  const [showEmergencySheet, setShowEmergencySheet] = useState(autoOpenEmergency ?? false)
  const [selectedListing, setSelectedListing] = useState<MarketplaceResult | null>(null)
  const [orderQty, setOrderQty] = useState(1)
  const [orderNotes, setOrderNotes] = useState('')
  const [orderUrgency, setOrderUrgency] = useState<'normal' | 'urgent' | 'critical'>('normal')
  const [orderSuccess, setOrderSuccess] = useState<{
    orderId: string; productName: string; sellerName: string; qty: number; total: number
  } | null>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data, isFetching } = useQuery({
    queryKey: ['p2p-marketplace', { q, city, page }],
    queryFn: () => p2pMarketplaceApi.search({
      q: q || undefined,
      city: city || undefined,
      limit: 40,
      offset: page * 40,
    }),
    placeholderData: prev => prev,
    staleTime: 60_000,
  })

  const orderMutation = useMutation({
    mutationFn: () => p2pOrdersApi.create({
      listingId: selectedListing!.listing.id,
      requestedQty: orderQty,
      notes: orderNotes || undefined,
      urgencyLevel: orderUrgency,
    }),
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ['p2p-orders'] })
      const listing = selectedListing!
      setOrderSuccess({
        orderId: order.id,
        productName: (listing.listing.productNameAr || listing.listing.productName) ?? '—',
        sellerName: listing.seller.legalName ?? 'الصيدلية',
        qty: orderQty,
        total: Number(listing.listing.price) * orderQty,
      })
      setSelectedListing(null)
      setOrderQty(1)
      setOrderNotes('')
      setOrderUrgency('normal')
    },
  })

  const openOrder = (r: MarketplaceResult) => {
    setSelectedListing(r)
    setOrderQty(Math.max(r.listing.minOrderQty || 1, 1))
  }

  // Client-side grouping & filtering
  const all = data?.data ?? []
  const byKm    = maxKm != null ? all.filter(r => r.distanceKm == null || r.distanceKm <= maxKm) : all
  const byPrice = maxPrice < 10000 ? byKm.filter(r => r.listing.price <= maxPrice) : byKm
  const byScore = minScore != null ? byPrice.filter(r => (r.reliability.overallScore ?? 0) >= minScore) : byPrice
  const byType  = typeFilter.length ? byScore.filter(r => typeFilter.some(f => {
    if (f === 'bonus')     return r.listing.offerType === 'bonus'
    if (f === 'emergency') return r.listing.listingType === 'emergency'
    if (f === 'clearance') return r.listing.listingType === 'clearance'
    if (f === 'normal')    return r.listing.listingType === 'normal' && r.listing.offerType !== 'bonus'
    return false
  })) : byScore
  const isBonus = (r: MarketplaceResult) => r.listing.offerType === 'bonus'
  const emergency = byType.filter(r => r.listing.listingType === 'emergency')
  const bonus     = byType.filter(r => isBonus(r) && r.listing.listingType !== 'emergency')
  const nearest   = byType.filter(r => !isBonus(r) && r.listing.listingType !== 'emergency' && r.distanceKm != null && r.distanceKm < 2)
  const clearance = byType.filter(r => r.listing.listingType === 'clearance' && !isBonus(r) && !(r.distanceKm != null && r.distanceKm < 2))
  const others    = byType.filter(r => r.listing.listingType === 'normal' && !isBonus(r) && !(r.distanceKm != null && r.distanceKm < 2))

  return (
    <div className="flex flex-col -mx-4 -mb-4" style={{ minHeight: '72vh' }}>

      {/* ── STICKY HEADER ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 pt-3 pb-2 shrink-0">

        {/* Two clearly separated zones */}
        <div className="flex gap-2.5 items-stretch">

          {/* Zone A: Emergency "أحتاج الآن" */}
          <div className="shrink-0 flex flex-col items-center gap-0.5">
            <button
              onClick={() => setShowEmergencySheet(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-violet-700 hover:bg-violet-800 text-white rounded-xl font-bold text-sm transition-colors shadow-sm whitespace-nowrap"
            >
              <Zap size={14} />
              {isRTL ? 'أحتاج الآن' : 'Need Now'}
            </button>
            <span className="text-[9px] text-gray-400 text-center leading-tight">حالات الطوارئ والعاجلة</span>
          </div>

          {/* Divider */}
          <div className="w-px bg-gray-200 self-stretch my-0.5" />

          {/* Zone B: Browse/Search */}
          <div className="flex-1 flex flex-col gap-0.5 min-w-0">
            <div className="relative">
              <Search size={14} className="absolute top-1/2 -translate-y-1/2 end-3 text-gray-400 pointer-events-none" />
              <input
                value={q}
                onChange={e => { setQ(e.target.value); setPage(0) }}
                placeholder={isRTL ? 'ابحث عن أي دواء في الشبكة...' : 'Search any medicine...'}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pe-8 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
              />
            </div>
            <span className="text-[9px] text-gray-400 ps-1">تصفح السوق واقارن العروض</span>
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[11px] text-gray-400">
            {byType.length} {isRTL ? 'عرض متاح' : 'listings'}
            {(data?.total ?? 0) > 40 ? ` ${isRTL ? 'من' : 'of'} ${data!.total}` : ''}
          </span>
          {isFetching && <Loader2 size={12} className="animate-spin text-emerald-500" />}
        </div>
      </div>

      {/* ── TWO COLUMNS ── */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0">

        {/* LEFT: Filters */}
        <div className="w-full md:w-[210px] shrink-0 border-e border-gray-100 bg-white overflow-y-auto flex flex-col" dir="rtl">
          <div className="p-4 space-y-5 flex-1">

            {/* City */}
            <div>
              <p className="text-[11px] font-bold text-gray-700 mb-2">المدينة</p>
              <input
                value={city}
                onChange={e => { setCity(e.target.value); setPage(0) }}
                placeholder="القاهرة، الرياض..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-gray-50"
              />
            </div>

            <div className="border-t border-gray-100" />

            {/* Rating */}
            <div>
              <p className="text-[11px] font-bold text-gray-700 mb-2.5">التقييم</p>
              <div className="space-y-2">
                {([
                  { label: 'الكل', val: null },
                  { label: '4.5+ نجوم', val: 90 },
                  { label: '4.0+ نجوم', val: 80 },
                ] as { label: string; val: number | null }[]).map(o => (
                  <label key={String(o.val)} className="flex items-center gap-2 cursor-pointer" onClick={() => setMinScore(o.val)}>
                    <div className={clsx('w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
                      minScore === o.val ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300 bg-white'
                    )}>
                      {minScore === o.val && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-sm text-gray-700">{o.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Offer type — no emoji icons */}
            <div>
              <p className="text-[11px] font-bold text-gray-700 mb-2.5">نوع العرض</p>
              <div className="space-y-2">
                {([
                  { key: 'normal',    label: 'عادي' },
                  { key: 'bonus',     label: 'بوانص' },
                  { key: 'clearance', label: 'تصفية' },
                  { key: 'emergency', label: 'طارئ' },
                ] as const).map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer"
                    onClick={() => setTypeFilter(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key])}>
                    <div className={clsx('w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                      typeFilter.includes(key) ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300 bg-white'
                    )}>
                      {typeFilter.includes(key) && (
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Price slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold text-gray-700">الحد الأقصى للسعر</p>
                <span className="text-[11px] text-emerald-700 font-semibold">
                  {maxPrice < 10000 ? `${maxPrice.toLocaleString()} ج.م` : 'الكل'}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={10000}
                step={100}
                value={maxPrice}
                onChange={e => setMaxPrice(Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-emerald-600 bg-gray-200"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-gray-400">0</span>
                <span className="text-[10px] text-gray-400">10,000 ج.م</span>
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Distance */}
            <div>
              <p className="text-[11px] font-bold text-gray-700 mb-2.5">المسافة</p>
              <div className="space-y-2">
                {([
                  { label: 'الكل', val: null },
                  { label: '< 2 كم', val: 2 },
                  { label: '< 5 كم', val: 5 },
                  { label: '< 15 كم', val: 15 },
                ] as { label: string; val: number | null }[]).map(o => (
                  <label key={String(o.val)} className="flex items-center gap-2 cursor-pointer" onClick={() => setMaxKm(o.val)}>
                    <div className={clsx('w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
                      maxKm === o.val ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300 bg-white'
                    )}>
                      {maxKm === o.val && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-sm text-gray-700">{o.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Reset button */}
          {(typeFilter.length > 0 || maxKm != null || minScore != null || city || maxPrice < 10000) && (
            <div className="p-4 border-t border-gray-100">
              <button
                onClick={() => { setTypeFilter([]); setMaxKm(null); setMinScore(null); setCity(''); setMaxPrice(10000) }}
                className="w-full py-2 rounded-xl border border-emerald-300 text-emerald-700 text-sm font-semibold hover:bg-emerald-50 transition-colors"
              >
                مسح كل عوامل التصفية
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: Grouped results */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 min-w-0">
          {isFetching && !data && (
            <div className="flex items-center justify-center h-40 gap-2 text-gray-400">
              <Loader2 size={20} className="animate-spin" /><span className="text-sm">جاري التحميل...</span>
            </div>
          )}
          {data && byType.length === 0 && (
            <div className="py-20 text-center">
              <Search size={28} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-600">لا توجد نتائج</p>
              <p className="text-xs text-gray-400 mt-1">جرّب تعديل الفلاتر أو البحث بكلمة مختلفة</p>
            </div>
          )}
          {emergency.length > 0 && (
            <ResultGroup title={isRTL ? 'طارئ — متوفر الآن' : 'Emergency'} count={emergency.length}>
              {emergency.map(r => <MarketplaceCard key={r.listing.id} result={r} isRTL={isRTL} onOrder={() => openOrder(r)} />)}
            </ResultGroup>
          )}
          {nearest.length > 0 && (
            <ResultGroup title={isRTL ? 'الأقرب إليك — أقل من 2 كم' : 'Nearest — Under 2 km'} count={nearest.length}>
              {nearest.map(r => <MarketplaceCard key={r.listing.id} result={r} isRTL={isRTL} onOrder={() => openOrder(r)} />)}
            </ResultGroup>
          )}
          {bonus.length > 0 && (
            <ResultGroup title={isRTL ? 'بوانص — اشترِ وأحصل على أكثر' : 'Bonus Offers'} count={bonus.length}>
              {bonus.map(r => <MarketplaceCard key={r.listing.id} result={r} isRTL={isRTL} onOrder={() => openOrder(r)} />)}
            </ResultGroup>
          )}
          {clearance.length > 0 && (
            <ResultGroup title={isRTL ? 'تصفية — أسعار مخفضة' : 'Clearance'} count={clearance.length}>
              {clearance.map(r => <MarketplaceCard key={r.listing.id} result={r} isRTL={isRTL} onOrder={() => openOrder(r)} />)}
            </ResultGroup>
          )}
          {others.length > 0 && (
            <ResultGroup title={isRTL ? 'جميع العروض' : 'All Listings'} count={others.length}>
              {others.map(r => <MarketplaceCard key={r.listing.id} result={r} isRTL={isRTL} onOrder={() => openOrder(r)} />)}
            </ResultGroup>
          )}
          {(data?.total ?? 0) > 40 && (
            <div className="flex items-center gap-3 justify-center pt-2">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50">
                {isRTL ? 'السابق' : 'Previous'}
              </button>
              <span className="text-sm text-gray-500">{Math.min((page + 1) * 40, data!.total)} / {data!.total}</span>
              <button disabled={(page + 1) * 40 >= (data?.total ?? 0)} onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50">
                {isRTL ? 'التالي' : 'Next'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Order modal */}
      {selectedListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedListing(null)} />
          <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">{isRTL ? 'طلب شراء' : 'Purchase Request'}</h3>
              <button onClick={() => setSelectedListing(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 font-bold text-sm">
                  {selectedListing.seller.legalName?.[0] ?? 'ص'}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{selectedListing.seller.legalName ?? '-'}</p>
                  <p className="text-xs text-gray-500">{selectedListing.seller.city ?? ''}</p>
                </div>
                <div className="ms-auto">
                  <TrustBadge level={selectedListing.reliability.trustLevel as TrustLevel} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                {[
                  { label: isRTL ? 'السعر/وحدة' : 'Unit Price', value: `${selectedListing.listing.price} ${isRTL ? 'ر.س' : 'SAR'}` },
                  { label: isRTL ? 'المتاح' : 'Available', value: selectedListing.listing.quantity },
                  { label: isRTL ? 'الحد الأدنى' : 'Min Order', value: selectedListing.listing.minOrderQty },
                ].map(({ label, value }) => (
                  <div key={label} className="p-3 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="font-bold text-gray-900">{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{isRTL ? 'الكمية المطلوبة' : 'Requested Quantity'}</label>
                <input type="number" min={selectedListing.listing.minOrderQty} max={selectedListing.listing.quantity}
                  value={orderQty} onChange={e => setOrderQty(parseInt(e.target.value))} className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">مستوى الأولوية</label>
                <div className="flex gap-2">
                  {(['normal', 'urgent', 'critical'] as const).map(u => (
                    <button key={u} type="button" onClick={() => setOrderUrgency(u)}
                      className={clsx('flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                        orderUrgency === u
                          ? u === 'critical' ? 'bg-red-100 border-red-400 text-red-700'
                            : u === 'urgent' ? 'bg-amber-100 border-amber-400 text-amber-700'
                            : 'bg-emerald-100 border-emerald-400 text-emerald-700'
                          : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50')}>
                      {u === 'normal' ? 'عادي' : u === 'urgent' ? '⚡ عاجل' : '🚨 حرج'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{isRTL ? 'ملاحظات (اختياري)' : 'Notes (optional)'}</label>
                <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} rows={2} className={INPUT}
                  placeholder={isRTL ? 'أي تعليمات للبائع...' : 'Any instructions for seller...'} />
              </div>
              <div className="flex items-center justify-between bg-emerald-50 rounded-xl p-3">
                <span className="text-sm font-medium text-gray-700">{isRTL ? 'الإجمالي' : 'Total'}</span>
                <span className="font-bold text-emerald-700">
                  {(Number(selectedListing.listing.price) * orderQty).toFixed(2)} {isRTL ? 'ر.س' : 'SAR'}
                </span>
              </div>
              {orderMutation.isError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {(orderMutation.error as any)?.response?.data?.message ?? (isRTL ? 'حدث خطأ' : 'Something went wrong')}
                </p>
              )}
              <button onClick={() => orderMutation.mutate()}
                disabled={orderMutation.isPending || orderQty < selectedListing.listing.minOrderQty}
                className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {orderMutation.isPending ? (isRTL ? 'جاري الإرسال...' : 'Sending...') : (isRTL ? 'إرسال طلب الشراء' : 'Send Purchase Request')}
              </button>
            </div>
          </div>
        </div>
      )}

      <EmergencyFinderSheet open={showEmergencySheet} onClose={() => setShowEmergencySheet(false)} />

      {/* ── ORDER SUCCESS MODAL ── */}
      {orderSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOrderSuccess(null)} />
          <div className="relative w-full max-w-sm mx-4 bg-white rounded-3xl shadow-2xl overflow-hidden">
            {/* Gradient header */}
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 px-6 pt-8 pb-10 text-center">
              <div className="mx-auto w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-3 ring-4 ring-white/30">
                <CheckCircle2 size={32} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-white">تم إرسال طلبك!</h2>
              <p className="text-emerald-100 text-sm mt-1">
                تم إخطار <span className="font-semibold text-white">{orderSuccess.sellerName}</span> بطلبك
              </p>
            </div>

            {/* Wave divider */}
            <div className="h-3 bg-gradient-to-br from-emerald-500 to-emerald-600 relative">
              <div className="absolute inset-x-0 bottom-0 h-3 bg-white rounded-t-3xl" />
            </div>

            {/* Details card */}
            <div className="px-6 pb-6 -mt-1 space-y-4">
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">المنتج</span>
                  <span className="text-sm font-semibold text-gray-800 text-right max-w-[55%] leading-tight">{orderSuccess.productName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">الكمية</span>
                  <span className="text-sm font-semibold text-gray-800">{orderSuccess.qty} وحدة</span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 pt-2 mt-2">
                  <span className="text-xs font-semibold text-gray-600">الإجمالي</span>
                  <span className="text-base font-bold text-emerald-700 tabular-nums">{orderSuccess.total.toFixed(2)} ج.م</span>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-amber-50 rounded-xl px-3 py-2.5">
                <Clock size={14} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">
                  ستحصل على رد من الصيدلية خلال <span className="font-semibold">ساعتين</span>. ستصلك إشعارات بكل تحديث.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => {
                    setOrderSuccess(null)
                    navigate(`/pharmacy/p2p?tab=orders&orderRole=buyer&highlight=${orderSuccess.orderId}`)
                  }}
                  className="py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors"
                >
                  متابعة الطلب
                </button>
                <button
                  onClick={() => setOrderSuccess(null)}
                  className="py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  حسناً
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MarketplaceCard({
  result, isRTL, onOrder,
}: { result: MarketplaceResult; isRTL: boolean; onOrder: () => void }) {
  const { listing, seller, reliability, distanceKm } = result
  const days  = daysLeft(listing.expiryDate)
  const score = Math.round((reliability.overallScore ?? 0) as number)

  const accentBar =
    listing.listingType === 'emergency' ? 'bg-red-500' :
    listing.listingType === 'clearance' || (days != null && days <= 30) ? 'bg-amber-400' :
    'bg-emerald-500'

  const name = (isRTL ? (listing.productNameAr || listing.productName) : (listing.productName || listing.productNameAr)) || '—'

  return (
    <div className="flex flex-col bg-white rounded-2xl border border-gray-200 hover:border-emerald-300 hover:shadow-md transition-all overflow-hidden">
      {/* Top accent stripe */}
      <div className={clsx('h-1 w-full', accentBar)} />

      {/* Two-column body */}
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-0 divide-x divide-x-reverse divide-gray-100 p-0">

        {/* RIGHT col (RTL primary): name, form, seller */}
        <div className="p-3 flex flex-col gap-1.5 min-w-0">
          <div>
            <p className="font-bold text-gray-900 text-sm leading-snug line-clamp-2">{name}</p>
            {(listing.productStrength || listing.productDosageForm) && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                {[listing.productStrength, listing.productDosageForm].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {(listing.productBarcode ?? listing.productCode) && (
            <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded w-fit">
              {listing.productBarcode ?? listing.productCode}
            </span>
          )}

          <div className="flex items-center gap-1.5 mt-auto pt-1">
            <div className="w-5 h-5 rounded-md bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-[10px] shrink-0">
              {seller.legalName?.[0] ?? 'ص'}
            </div>
            <span className="text-[11px] text-gray-600 font-medium truncate">{seller.legalName ?? '-'}</span>
            {seller.city && (
              <span className="flex items-center gap-0.5 text-[10px] text-gray-400 shrink-0">
                <MapPin size={8} />{seller.city}
              </span>
            )}
          </div>
        </div>

        {/* LEFT col (RTL secondary): price, badges, qty, score */}
        <div className="p-3 flex flex-col gap-1.5 items-start min-w-0">
          {/* Price */}
          <div className="flex items-baseline gap-1 flex-wrap">
            <span className="text-xl font-black text-gray-900 leading-none">{listing.price}</span>
            <span className="text-[10px] text-gray-400">{isRTL ? 'ر.س' : 'SAR'}</span>
            {distanceKm != null && (
              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full ms-auto">
                {distanceKm.toFixed(1)} كم
              </span>
            )}
          </div>

          {/* Offer badges */}
          <div className="flex flex-wrap gap-1">
            {listing.offerType === 'bonus' && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                {listing.bonusQty ? `🎁 ${listing.minOrderQty}+${listing.bonusQty}` : '🎁 بوانص'}
              </span>
            )}
            {listing.discountPct && listing.offerType !== 'bonus' && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                خصم {listing.discountPct}%
              </span>
            )}
            {listing.listingType !== 'normal' && (
              <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full border',
                listing.listingType === 'emergency' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'
              )}>
                {listing.listingType === 'emergency' ? '⚡ طارئ' : '🔥 تصفية'}
              </span>
            )}
            {days != null && days <= 30 && (
              <span className="text-[10px] text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
                {days} يوم صلاحية
              </span>
            )}
          </div>

          {/* Qty + score */}
          <div className="flex items-center gap-2 mt-auto pt-1 w-full">
            <span className="text-[11px] text-gray-400">{listing.quantity} وحدة</span>
            <span className={clsx('shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ms-auto',
              score >= 70 ? 'bg-emerald-100 text-emerald-700' :
              score >= 40 ? 'bg-amber-100 text-amber-700' :
              'bg-gray-100 text-gray-500'
            )}>
              ⭐ {score}
            </span>
          </div>
        </div>
      </div>

      {/* Full-width CTA at bottom */}
      <button
        onClick={onOrder}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-t border-gray-100 text-emerald-600 hover:bg-emerald-50 text-sm font-semibold transition-colors"
      >
        <ShoppingCart size={14} />
        {isRTL ? 'طلب الآن' : 'Order Now'}
      </button>
    </div>
  )
}

// ── SELL TAB ──────────────────────────────────────────────────────────────────

function SellTab({
  isRTL, guardPublish, hasProfile, profileLoading, sellerProfile, onGoToProfile, autoOpenAdd, initialItemId, nearExpiryPreset,
}: {
  isRTL: boolean
  guardPublish: (fn: () => void) => void
  hasProfile: boolean
  profileLoading?: boolean
  sellerProfile?: import('../../types/p2p').SellerProfile | null
  onGoToProfile: () => void
  autoOpenAdd?: boolean
  initialItemId?: string
  nearExpiryPreset?: boolean
}) {
  const qc = useQueryClient()
  const { currency } = useCurrency()
  const [, setSearchParams] = useSearchParams()
  const [showAddForm, setShowAddForm] = useState(false)
  const [listingSearch, setListingSearch] = useState('')
  const [listingStatusFilter, setListingStatusFilter] = useState<'' | 'active' | 'paused' | 'sold_out' | 'expired'>('')
  // When arriving from the expiry risk banner, pre-filter to clearance listings
  const [listingTypeFilter, setListingTypeFilter] = useState<'' | 'normal' | 'clearance' | 'emergency'>(nearExpiryPreset ? 'clearance' : '')

  // honour ?openAdd=1 (and optional ?itemId=) URL flags from expiry alert CTAs
  useEffect(() => {
    if (autoOpenAdd && hasProfile) {
      guardPublish(() => setShowAddForm(true))
      setSearchParams(p => { p.delete('openAdd'); p.delete('itemId'); return p }, { replace: true })
    }
  }, [autoOpenAdd, hasProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up preset param from URL after reading it
  useEffect(() => {
    if (nearExpiryPreset) {
      setSearchParams(p => { p.delete('preset'); return p }, { replace: true })
    }
  }, [nearExpiryPreset]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: myListings, isFetching } = useQuery({
    queryKey: ['p2p-my-listings'],
    queryFn: () => p2pListingApi.list({ limit: 50 }),
  })

  // Single-aggregate endpoint — fires in parallel with listings fetch
  const { data: sellerStats } = useQuery({
    queryKey: ['p2p-seller-stats'],
    queryFn: p2pSellerApi.getSellerStats,
    staleTime: 60_000,
    enabled: hasProfile,
  })

  const activeCount  = myListings?.data.filter(l => l.status === 'active').length  ?? 0
  const pausedCount  = myListings?.data.filter(l => l.status === 'paused').length  ?? 0

  const filteredListings = useMemo(() => {
    if (!myListings?.data) return []
    return myListings.data.filter(l => {
      if (listingStatusFilter && l.status !== listingStatusFilter) return false
      if (listingTypeFilter && l.listingType !== listingTypeFilter) return false
      if (listingSearch) {
        const q = listingSearch.toLowerCase()
        const matchName = (l.productNameAr ?? l.productName ?? '').toLowerCase().includes(q)
        const matchBarcode = (l.productBarcode ?? '').toLowerCase().includes(q)
        if (!matchName && !matchBarcode) return false
      }
      return true
    })
  }, [myListings?.data, listingSearch, listingStatusFilter, listingTypeFilter])

  if (profileLoading) return (
    <div className="flex justify-center py-20">
      <Loader2 size={32} className="animate-spin text-emerald-500" />
    </div>
  )

  if (!hasProfile) return (
    <div className="flex flex-col items-center justify-center py-20 text-center max-w-sm mx-auto gap-5">
      <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center">
        <Store size={30} className="text-emerald-600" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-gray-900">
          {isRTL ? 'أكمل ملفك كبائع أولاً' : 'Complete your seller profile first'}
        </h2>
        <p className="text-sm text-gray-500 mt-2">
          {isRTL
            ? 'لبدء البيع في شبكة تبادل الصيدليات، تحتاج إلى إعداد ملفك الشخصي كبائع وقبول شروط الاستخدام.'
            : 'To start selling on the Pharmacy Exchange Network, set up your seller profile and accept the trading terms.'}
        </p>
      </div>
      <button
        onClick={onGoToProfile}
        className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors"
      >
        {isRTL ? 'إعداد ملفي كبائع' : 'Set Up Seller Profile'}
        <ArrowRight size={16} className={isRTL ? 'rotate-180' : ''} />
      </button>
    </div>
  )

  return (
    <div className="space-y-4">

      {/* Verification status banner */}
      {sellerProfile && sellerProfile.verificationStatus !== 'verified' && (
        <div className={clsx(
          'flex items-start gap-3 px-4 py-3.5 rounded-2xl border text-sm',
          sellerProfile.verificationStatus === 'rejected'
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-amber-50 border-amber-200 text-amber-800',
        )}>
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">
              {sellerProfile.verificationStatus === 'rejected'
                ? (isRTL ? 'تم رفض ملفك — يُرجى المراجعة' : 'Profile rejected — please review')
                : (isRTL ? 'في انتظار مراجعة الإدارة — سنُبلّغك عند الموافقة' : 'Pending admin review — you\'ll be notified when approved')}
            </p>
            <p className="text-xs mt-0.5 opacity-80">
              {isRTL
                ? 'يمكنك إضافة وتعديل إعلاناتك الآن. ستظهر في السوق فور اعتماد حسابك.'
                : 'You can add and manage listings now. They\'ll appear in the marketplace once your account is approved.'}
            </p>
            {sellerProfile.verificationStatus === 'rejected' && sellerProfile.rejectionReason && (
              <p className="text-xs mt-1 font-medium">{isRTL ? 'السبب: ' : 'Reason: '}{sellerProfile.rejectionReason}</p>
            )}
          </div>
        </div>
      )}

      {/* Near-expiry context banner — shown when arriving from AI Center expiry risk card */}
      {nearExpiryPreset && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl border border-amber-200 bg-amber-50 text-sm text-amber-900">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">
              {isRTL ? 'أنت هنا لأن لديك مخزونًا سينتهي خلال 180 يومًا' : 'You arrived here because you have stock expiring within 180 days'}
            </p>
            <p className="text-xs mt-0.5 text-amber-700">
              {isRTL
                ? 'عرض إعلانات التصفية الخاصة بك — أضف إعلانًا جديدًا لأي منتج قارب انتهاء صلاحيته واستعد قيمته قبل أن يتلف'
                : 'Showing your clearance listings — add a new listing for any near-expiry product and recover its value before it expires'}
            </p>
          </div>
          <button
            className="text-xs text-amber-700 underline underline-offset-2 whitespace-nowrap shrink-0"
            onClick={() => setListingTypeFilter('')}
          >
            {isRTL ? 'عرض الكل' : 'Show all'}
          </button>
        </div>
      )}

      {/* Stats strip */}
      {!!myListings?.total && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              labelAr: 'إعلانات نشطة',
              labelEn: 'Active Listings',
              value: activeCount,
              icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50',
            },
            {
              labelAr: 'إعلانات مؤقفة',
              labelEn: 'Paused Listings',
              value: pausedCount,
              icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50',
            },
            {
              labelAr: 'إجمالي الكمية المباعة',
              labelEn: 'Total Qty Sold',
              value: sellerStats ? sellerStats.totalQtySold.toLocaleString() : '—',
              sub: isRTL ? 'وحدة' : 'units',
              icon: TrendingDown, color: 'text-blue-600', bg: 'bg-blue-50',
            },
            {
              labelAr: 'الإيرادات',
              labelEn: 'Revenue',
              value: sellerStats
                ? `${Number(sellerStats.totalRevenue).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
                : '—',
              icon: DollarSign, color: 'text-purple-600', bg: 'bg-purple-50',
            },
          ].map((stat, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-3">
              <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', stat.bg)}>
                <stat.icon size={18} className={stat.color} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold text-gray-900 leading-tight tabular-nums">{stat.value}</p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{isRTL ? stat.labelAr : stat.labelEn}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Header row + search toolbar */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">{isRTL ? 'قوائم البيع' : 'My Listings'}</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {filteredListings.length !== (myListings?.total ?? 0)
                ? `${filteredListings.length} من ${myListings?.total ?? 0}`
                : `${myListings?.total ?? 0} ${isRTL ? 'إعلان' : 'listings'}`}
            </p>
          </div>
          <button
            id="p2p-add-listing-btn"
            onClick={() => guardPublish(() => setShowAddForm(true))}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm shrink-0"
          >
            <Plus size={15} />
            {isRTL ? 'إعلان جديد' : 'New Listing'}
          </button>
        </div>
        {/* Search + filter bar */}
        {(myListings?.data.length ?? 0) > 0 && (
          <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 bg-gray-50/50 border-b border-gray-100">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute inset-y-0 start-3 my-auto text-gray-400 pointer-events-none" />
              <input
                value={listingSearch}
                onChange={e => setListingSearch(e.target.value)}
                placeholder={isRTL ? 'بحث بالاسم أو الباركود...' : 'Search name or barcode...'}
                className="w-full ps-8 pe-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                dir={isRTL ? 'rtl' : 'ltr'}
              />
            </div>
            <div className="relative shrink-0">
              <select
                value={listingStatusFilter}
                onChange={e => setListingStatusFilter(e.target.value as any)}
                className="appearance-none ps-3 pe-7 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-gray-700"
                dir={isRTL ? 'rtl' : 'ltr'}
              >
                <option value="">الحالة: الكل</option>
                <option value="active">نشط</option>
                <option value="paused">موقف</option>
                <option value="sold_out">نفذ</option>
                <option value="expired">منتهي</option>
              </select>
              <ChevronDown size={11} className="absolute inset-y-0 end-2 my-auto text-gray-400 pointer-events-none" />
            </div>
            <div className="relative shrink-0">
              <select
                value={listingTypeFilter}
                onChange={e => setListingTypeFilter(e.target.value as any)}
                className="appearance-none ps-3 pe-7 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-gray-700"
                dir={isRTL ? 'rtl' : 'ltr'}
              >
                <option value="">النوع: الكل</option>
                <option value="normal">عادي</option>
                <option value="clearance">🔥 تصفية</option>
                <option value="emergency">⚡ طارئ</option>
              </select>
              <ChevronDown size={11} className="absolute inset-y-0 end-2 my-auto text-gray-400 pointer-events-none" />
            </div>
            {(listingSearch || listingStatusFilter || listingTypeFilter) && (
              <button
                onClick={() => { setListingSearch(''); setListingStatusFilter(''); setListingTypeFilter('') }}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-gray-100"
              >
                <X size={11} /> مسح
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <AddListingForm
          isRTL={isRTL}
          onClose={() => setShowAddForm(false)}
          onCreated={() => {
            setShowAddForm(false)
            qc.invalidateQueries({ queryKey: ['p2p-my-listings'] })
          }}
          initialInventoryItemId={initialItemId}
        />
      )}

      {/* Loading state */}
      {isFetching && !myListings && (
        <div className="flex items-center justify-center h-24 text-gray-400">
          <Loader2 size={18} className="animate-spin" />
        </div>
      )}

      {!myListings?.data.length && !showAddForm && (
        <div className="py-16 text-center bg-white rounded-2xl border border-gray-200">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <Package size={24} className="text-emerald-500" />
          </div>
          <p className="text-sm font-semibold text-gray-800">
            {isRTL ? 'لا توجد إعلانات بعد' : 'No listings yet'}
          </p>
          <p className="text-xs text-gray-400 mt-1.5 max-w-xs mx-auto leading-relaxed">
            {isRTL
              ? 'أنشئ أول إعلان لبيع منتجاتك للصيدليات الأخرى وابدأ الربح من مخزونك'
              : 'Create your first listing to sell surplus stock to other pharmacies'}
          </p>
        </div>
      )}

      {filteredListings.length === 0 && !!myListings?.data.length && !showAddForm && (
        <div className="py-10 text-center bg-white rounded-2xl border border-gray-200">
          <p className="text-sm text-gray-500">{isRTL ? 'لا توجد نتائج مطابقة للفلتر' : 'No listings match your filter'}</p>
        </div>
      )}

      {filteredListings.length > 0 && (
        <MyListingsTable listings={filteredListings} isRTL={isRTL} />
      )}

      {/* Expiry alerts — always visible so seller knows what to list next */}
      <ExpiryAlertsPanel isRTL={isRTL} />
    </div>
  )
}

// ── Helpers for inventory item health ────────────────────────────────────────
function itemDaysLeft(item: InventoryItem) {
  if (!item.expiryDate) return null
  return Math.floor((new Date(item.expiryDate).getTime() - Date.now()) / 86_400_000)
}

function getItemIssues(item: InventoryItem) {
  const issues: { code: string; blocking: boolean; labelAr: string; labelEn: string }[] = []
  if (item.linkStatus && item.linkStatus !== 'linked') {
    issues.push({ code: 'UNLINKED', blocking: true, labelAr: 'غير مربوط بالكتالوج', labelEn: 'Not linked to catalog' })
  }
  if (item.quantity <= 0) {
    issues.push({ code: 'ZERO_STOCK', blocking: true, labelAr: 'المخزون صفر', labelEn: 'Zero stock' })
  }
  const days = itemDaysLeft(item)
  if (days !== null && days < 0) {
    issues.push({ code: 'EXPIRED', blocking: true, labelAr: 'منتهي الصلاحية', labelEn: 'Expired' })
  } else if (days !== null && days <= 30) {
    issues.push({ code: 'NEAR_30', blocking: false, labelAr: `ينتهي خلال ${days} يوم`, labelEn: `Expires in ${days} days` })
  } else if (days !== null && days <= 60) {
    issues.push({ code: 'NEAR_60', blocking: false, labelAr: `ينتهي خلال ${days} يوم`, labelEn: `Expires in ${days} days` })
  } else if (days !== null && days <= 90) {
    issues.push({ code: 'NEAR_90', blocking: false, labelAr: `ينتهي خلال ${days} يوم`, labelEn: `Expires in ${days} days` })
  }
  return issues
}

function suggestListingType(item: InventoryItem): 'normal' | 'clearance' | 'emergency' {
  const days = itemDaysLeft(item)
  if (days !== null && days <= 60) return 'clearance'
  if (item.quantity <= 5 && item.quantity > 0) return 'emergency'
  return 'normal'
}

// ── Inline fix: link unlinked item to catalog ─────────────────────────────────
function LinkProductModal({ item, isRTL, qc, onClose, onLinked }: {
  item: InventoryItem
  isRTL: boolean
  qc: ReturnType<typeof useQueryClient>
  onClose: () => void
  onLinked: (updated: InventoryItem) => void
}) {
  const [q, setQ] = useState(item.product?.name ?? item.product?.nameAr ?? '')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState('')

  const { data: products = [], isFetching } = useQuery({
    queryKey: ['link-catalog-search', q],
    queryFn: () => inventoryApi.getProducts(q || undefined).then((r: any) => {
      const body = r?.data
      if (Array.isArray(body)) return body
      if (Array.isArray(body?.data)) return body.data
      return []
    }),
    staleTime: 30_000,
  })

  async function handleLink() {
    if (!selectedId) return
    setLinking(true); setLinkError('')
    try {
      await inventoryApi.linkToProduct(item.id, { productId: selectedId, score: 100, signals: ['manual_link'] })
      await qc.invalidateQueries({ queryKey: ['inventory-picker'] })
      onLinked({ ...item, linkStatus: 'linked', productId: selectedId })
    } catch (e: any) {
      setLinkError(e?.response?.data?.message ?? e?.message ?? 'فشل الربط')
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="bg-white rounded-2xl w-full max-w-md mx-4 max-h-[75vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Link2 size={16} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm">{isRTL ? 'ربط بالكتالوج' : 'Link to Catalog'}</h3>
              <p className="text-[11px] text-gray-500 truncate max-w-[200px]">
                {item.product?.nameAr || item.product?.name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="p-3 border-b shrink-0">
          <div className="relative">
            <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder={isRTL ? 'ابحث في الكتالوج...' : 'Search catalog...'}
              className="w-full ps-8 pe-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-300"
              autoFocus />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
          {isFetching ? (
            <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-emerald-500" /></div>
          ) : products.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-6">{isRTL ? 'لا توجد نتائج' : 'No results'}</p>
          ) : (products as any[]).map(p => (
            <button key={p.id} type="button" onMouseDown={() => setSelectedId(p.id)}
              className={clsx(
                'w-full flex items-center gap-3 p-2.5 rounded-xl border text-start transition-colors',
                selectedId === p.id ? 'border-emerald-300 bg-emerald-50' : 'border-transparent hover:bg-gray-50',
              )}>
              <div className={clsx('w-4 h-4 rounded-full border-2 shrink-0 transition-colors',
                selectedId === p.id ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300')} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-900 truncate">{p.nameAr || p.name}</p>
                <p className="text-[10px] text-gray-400 truncate">{p.name}{p.barcode ? ` · ${p.barcode}` : ''}</p>
              </div>
            </button>
          ))}
        </div>

        {linkError && <p className="px-4 pb-2 text-xs text-red-600 shrink-0">{linkError}</p>}

        <div className="p-3 border-t flex gap-2 shrink-0">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
          <button type="button" onClick={handleLink} disabled={!selectedId || linking}
            className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
            {linking ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            {isRTL ? 'ربط المنتج' : 'Link Product'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Inline fix: update expired item's expiry date ─────────────────────────────
function UpdateExpiryModal({ item, isRTL, qc, onClose, onUpdated }: {
  item: InventoryItem
  isRTL: boolean
  qc: ReturnType<typeof useQueryClient>
  onClose: () => void
  onUpdated: (updated: InventoryItem) => void
}) {
  const [newDate, setNewDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function handleSave() {
    if (!newDate) return
    setSaving(true); setSaveError('')
    try {
      await inventoryApi.update(item.id, { expiryDate: newDate })
      await qc.invalidateQueries({ queryKey: ['inventory-picker'] })
      onUpdated({ ...item, expiryDate: newDate })
      onClose()
    } catch (e: any) {
      setSaveError(e?.response?.data?.message ?? e?.message ?? 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const days = item.expiryDate
    ? Math.floor((new Date(item.expiryDate).getTime() - Date.now()) / 86_400_000)
    : null

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="bg-white rounded-2xl w-full max-w-sm mx-4 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center">
              <Calendar size={16} className="text-orange-600" />
            </div>
            <h3 className="font-bold text-gray-900 text-sm">
              {isRTL ? 'تحديث تاريخ الانتهاء' : 'Update Expiry Date'}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 bg-white border border-gray-100 rounded-xl flex items-center justify-center shrink-0">
              <Package size={16} className="text-gray-400" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">
                {item.product?.nameAr || item.product?.name}
              </p>
              {item.product?.name && item.product?.nameAr && (
                <p className="text-[11px] text-gray-400 truncate">{item.product.name}</p>
              )}
              {days !== null && (
                <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                  {days < 0 ? (isRTL ? 'منتهي الصلاحية' : 'Expired') : `${days} ${isRTL ? 'يوم' : 'days left'}`}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              {isRTL ? 'تاريخ الانتهاء الجديد' : 'New expiry date'}
            </label>
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
              autoFocus />
          </div>

          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
        </div>

        <div className="p-3 border-t flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
          <button type="button" onClick={handleSave} disabled={!newDate || saving}
            className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-orange-600 transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {isRTL ? 'حفظ' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Smart inventory picker ────────────────────────────────────────────────────
function InventoryPicker({ value, onChange, isRTL, qc }: {
  value: InventoryItem | null
  onChange: (item: InventoryItem | null) => void
  isRTL: boolean
  qc: ReturnType<typeof useQueryClient>
}) {
  const [query, setQuery]         = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [open, setOpen]           = useState(false)
  const [showLinkModal, setShowLinkModal]   = useState(false)
  const [showExpiryModal, setShowExpiryModal] = useState(false)
  const [dropPos, setDropPos]     = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropRef  = useRef<HTMLDivElement>(null)

  // Debounce query → server call only fires 300ms after user stops typing
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  // Server-side search: only runs when picker is open, re-runs on debouncedQ change
  const { data: items = [], isLoading, isFetching, isError } = useQuery({
    queryKey: ['inventory-picker', debouncedQ],
    queryFn: async () => {
      const r = await inventoryApi.getAll({ limit: 25, q: debouncedQ || undefined })
      const body = (r as any).data
      if (Array.isArray(body)) return body as InventoryItem[]
      if (Array.isArray(body?.data)) return body.data as InventoryItem[]
      return [] as InventoryItem[]
    },
    enabled: open,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  // Compute fixed dropdown position from input bounding rect
  const openDropdown = useCallback(() => {
    if (!inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    setDropPos({ top: r.bottom + 4, left: r.left, width: r.width })
    setOpen(true)
  }, [])

  // Close on outside click / scroll
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node) && !inputRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const handleSelect = (item: InventoryItem) => {
    onChange(item); setOpen(false); setQuery('')
  }

  // ── Selected item card ─────────────────────────────────────────────────────
  if (value) {
    const issues  = getItemIssues(value)
    const hasBlock = issues.some(i => i.blocking)
    const days    = itemDaysLeft(value)

    return (
      <div className="space-y-2">
        {/* Selected card */}
        <div className={clsx(
          'flex items-start gap-3 p-3.5 rounded-xl border',
          hasBlock ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50/40',
        )}>
          <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center shrink-0">
            <Package size={18} className="text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">{value.product?.name}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {/* Product code — SKU preferred, fall back to barcode */}
              {(value.product?.sku || value.product?.barcode) && (
                <span className="text-[11px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                  {isRTL ? 'كود: ' : 'Code: '}{value.product?.sku || value.product?.barcode}
                </span>
              )}
              {/* Stock */}
              <span className={clsx('text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
                value.quantity <= 0 ? 'bg-red-100 text-red-700'
                : value.quantity <= 5 ? 'bg-amber-100 text-amber-700'
                : 'bg-emerald-100 text-emerald-700'
              )}>
                {isRTL ? `${value.quantity} علبة` : `${value.quantity} units`}
              </span>
              {/* Expiry */}
              {days !== null && (
                <span className={clsx('text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
                  days < 0 ? 'bg-red-100 text-red-700'
                  : days <= 30 ? 'bg-red-100 text-red-700'
                  : days <= 60 ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-600'
                )}>
                  {days < 0
                    ? (isRTL ? 'منتهي' : 'Expired')
                    : isRTL ? `${days} يوم` : `${days}d`}
                </span>
              )}
              {/* Link status */}
              {value.linkStatus && value.linkStatus !== 'linked' && (
                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
                  {isRTL ? 'غير مربوط' : 'Unlinked'}
                </span>
              )}
            </div>
          </div>
          <button onClick={() => onChange(null)}
            className="p-1 hover:bg-white/80 rounded-lg text-gray-400 hover:text-gray-600 transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>

        {/* Blocking issues */}
        {issues.filter(i => i.blocking).map(issue => (
          <div key={issue.code} className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <XCircle size={14} className="text-red-500 shrink-0" />
              <p className="text-xs font-semibold text-red-700">{isRTL ? issue.labelAr : issue.labelEn}</p>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold ms-auto">
                {isRTL ? 'يمنع النشر' : 'Blocks publish'}
              </span>
            </div>

            {/* EXPIRED → open update expiry modal */}
            {issue.code === 'EXPIRED' && (
              <button type="button" onClick={() => setShowExpiryModal(true)}
                className="mt-1 flex items-center gap-2 px-3 py-2 bg-orange-500 text-white rounded-xl text-xs font-semibold hover:bg-orange-600 transition-colors">
                <Calendar size={13} />
                {isRTL ? 'تحديث تاريخ الانتهاء' : 'Update Expiry Date'}
              </button>
            )}

            {/* UNLINKED → open link modal */}
            {issue.code === 'UNLINKED' && (
              <button type="button" onClick={() => setShowLinkModal(true)}
                className="mt-1 flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors">
                <Link2 size={13} />
                {isRTL ? 'ربط المنتج' : 'Link Product'}
              </button>
            )}

            {/* ZERO_STOCK */}
            {issue.code === 'ZERO_STOCK' && (
              <p className="text-[11px] text-red-600">
                {isRTL ? 'أضف مخزوناً لهذا المنتج أولاً' : 'Add stock to this item first'}
              </p>
            )}
          </div>
        ))}

        {/* Non-blocking warnings */}
        {issues.filter(i => !i.blocking).map(issue => (
          <div key={issue.code} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <AlertCircle size={13} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700">{isRTL ? issue.labelAr : issue.labelEn}</p>
            {(issue.code === 'NEAR_30' || issue.code === 'NEAR_60') && (
              <span className="text-[10px] ms-auto text-amber-600 font-medium">
                {isRTL ? '→ فكّر في التصفية' : '→ Consider clearance'}
              </span>
            )}
          </div>
        ))}

        {/* Inline modals */}
        {showLinkModal && (
          <LinkProductModal
            item={value}
            isRTL={isRTL}
            qc={qc}
            onClose={() => setShowLinkModal(false)}
            onLinked={updated => { onChange(updated); setShowLinkModal(false) }}
          />
        )}
        {showExpiryModal && (
          <UpdateExpiryModal
            item={value}
            isRTL={isRTL}
            qc={qc}
            onClose={() => setShowExpiryModal(false)}
            onUpdated={updated => { onChange(updated); setShowExpiryModal(false) }}
          />
        )}
      </div>
    )
  }

  const showDrop = open && dropPos

  // ── Search input ────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="relative">
        <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); openDropdown() }}
          onFocus={openDropdown}
          placeholder={isRTL ? 'ابحث بالاسم، الباركود، الرمز، رقم الدفعة...' : 'Search by name, barcode, SKU, batch...'}
          className="w-full ps-9 pe-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-300 focus:border-violet-400 outline-none bg-gray-50"
          autoComplete="off"
        />
        {(isLoading || isFetching) && (
          <Loader2 size={14} className="absolute end-3 top-1/2 -translate-y-1/2 text-emerald-400 animate-spin" />
        )}
      </div>

      {/* Fixed-position dropdown — immune to parent overflow:hidden */}
      {showDrop && (
        <div
          ref={dropRef}
          style={{ position: 'fixed', top: dropPos!.top, left: dropPos!.left, width: dropPos!.width, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto"
        >
          {(isLoading || isFetching) && items.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-gray-400">
              <Loader2 size={12} className="animate-spin shrink-0" />
              {isRTL ? 'جاري البحث...' : 'Searching...'}
            </div>
          )}
          {isError && (
            <p className="px-4 py-3 text-xs text-red-500 text-center">
              {isRTL ? 'تعذّر تحميل المخزون' : 'Failed to load inventory'}
            </p>
          )}
          {!isLoading && !isError && items.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-400 text-center">
              {debouncedQ
                ? (isRTL ? `لا توجد نتائج لـ "${debouncedQ}"` : `No results for "${debouncedQ}"`)
                : (isRTL ? 'ابدأ بالكتابة للبحث في المخزون' : 'Start typing to search inventory')}
            </p>
          )}
          {items.map((item: InventoryItem) => {
            const issues   = getItemIssues(item)
            const hasBlock = issues.some(i => i.blocking)
            const days     = itemDaysLeft(item)
            const code     = item.product?.barcode ?? (item.product as any)?.sku ?? null
            return (
              <button key={item.id}
                onMouseDown={e => { e.preventDefault(); handleSelect(item) }}
                className="w-full flex items-start gap-3 px-3 py-3 hover:bg-gray-50 text-start border-b border-gray-100 last:border-0 transition-colors">

                {/* Status dot */}
                <div className={clsx(
                  'w-2 h-2 rounded-full mt-1.5 shrink-0',
                  hasBlock ? 'bg-red-400' : issues.length ? 'bg-amber-400' : 'bg-emerald-400'
                )} />

                <div className="flex-1 min-w-0">
                  {/* Product name */}
                  <p className="text-sm font-semibold text-gray-800 truncate leading-tight">
                    {item.product?.name ?? item.productId}
                  </p>

                  {/* Tag row */}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {/* Product code */}
                    {code && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        {isRTL ? 'كود:' : 'SKU:'} {code}
                      </span>
                    )}

                    {/* Stock */}
                    <span className={clsx(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                      item.quantity <= 0
                        ? 'bg-red-100 text-red-700'
                        : item.quantity <= 5
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-50 text-emerald-700'
                    )}>
                      {item.quantity <= 0
                        ? (isRTL ? '⚠ لا توجد كمية' : '⚠ Out of stock')
                        : (isRTL ? `${item.quantity} علبة` : `${item.quantity} units`)}
                    </span>

                    {/* Expiry */}
                    {days !== null && days < 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                        {isRTL ? 'منتهي الصلاحية' : 'Expired'}
                      </span>
                    )}
                    {days !== null && days >= 0 && days <= 30 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-600">
                        {isRTL ? `ينتهي خلال ${days} يوم` : `Expires in ${days}d`}
                      </span>
                    )}
                    {days !== null && days > 30 && days <= 90 && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">
                        {isRTL ? `${days} يوم متبقي` : `${days}d left`}
                      </span>
                    )}

                    {/* Link status */}
                    {item.linkStatus && item.linkStatus !== 'linked' && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
                        {isRTL ? 'غير مربوط بالكتالوج' : 'Not in catalog'}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Offer Builder ────────────────────────────────────────────────────────────
type OfferMode = 'none' | 'discount' | 'bonus'

function OfferBuilder({ isRTL, offerMode, onOfferMode, discountPct, onDiscountPct,
  autoDiscount, onAutoDiscount, bonusReqQty, onBonusReqQty, bonusQty, onBonusQty, listingType }: {
  isRTL: boolean
  offerMode: OfferMode
  onOfferMode: (m: OfferMode) => void
  discountPct: string
  onDiscountPct: (v: string) => void
  autoDiscount: boolean
  onAutoDiscount: (v: boolean) => void
  bonusReqQty: string
  onBonusReqQty: (v: string) => void
  bonusQty: string
  onBonusQty: (v: string) => void
  listingType: string
}) {
  const effectivePct = (() => {
    const req = parseFloat(bonusReqQty), bon = parseFloat(bonusQty)
    if (!req || !bon || req <= 0) return null
    return ((bon / (req + bon)) * 100).toFixed(1)
  })()

  const TYPES = [
    { id: 'none',     icon: '—',  labelAr: 'بدون عرض',  labelEn: 'No offer',
      selCls: 'border-gray-300 bg-gray-50', iconCls: 'text-gray-400' },
    { id: 'discount', icon: '%',  labelAr: 'خصم مباشر', labelEn: 'Discount',
      selCls: 'border-emerald-400 bg-emerald-50', iconCls: 'text-emerald-600' },
    { id: 'bonus',    icon: '🎁', labelAr: 'بوانص',     labelEn: 'Bonus',
      selCls: 'border-purple-400 bg-purple-50', iconCls: 'text-purple-600' },
  ] as const

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600">
          {isRTL ? 'العرض الترويجي' : 'Promotional offer'}
        </span>
        {listingType === 'clearance' && offerMode === 'none' && (
          <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
            <AlertCircle size={10} />
            {isRTL ? 'يُنصح بإضافة عرض لإعلانات التصفية' : 'Offer recommended for clearance'}
          </span>
        )}
      </div>

      {/* Type selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {TYPES.map(t => (
          <button key={t.id} type="button" onClick={() => onOfferMode(t.id as OfferMode)}
            className={clsx(
              'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all',
              offerMode === t.id ? t.selCls : 'border-gray-100 bg-white hover:border-gray-200',
            )}>
            <span className={clsx('text-base font-bold leading-none', offerMode === t.id ? t.iconCls : 'text-gray-400')}>
              {t.icon}
            </span>
            <span className={clsx('text-[11px] font-semibold', offerMode === t.id ? 'text-gray-900' : 'text-gray-500')}>
              {isRTL ? t.labelAr : t.labelEn}
            </span>
          </button>
        ))}
      </div>

      {/* Discount panel */}
      {offerMode === 'discount' && (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                {isRTL ? 'نسبة الخصم' : 'Discount %'}
                {listingType === 'clearance' && <span className="text-red-500 ms-1">*</span>}
              </label>
              <div className="relative">
                <input type="number" min="1" max="99" value={discountPct}
                  onChange={e => onDiscountPct(e.target.value)}
                  className="w-full border border-emerald-300 rounded-xl px-3 pe-7 py-2.5 text-sm bg-white focus:ring-2 focus:ring-violet-400 outline-none font-bold text-xl text-center"
                  placeholder="0" />
                <span className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">%</span>
              </div>
            </div>
            {discountPct && parseFloat(discountPct) > 0 && (
              <div className="shrink-0 w-20 bg-white border-2 border-emerald-300 rounded-xl p-2 text-center">
                <p className="text-[10px] text-gray-400">{isRTL ? 'معاينة' : 'Preview'}</p>
                <p className="text-2xl font-extrabold text-emerald-600 leading-tight">{Math.round(parseFloat(discountPct))}%</p>
                <p className="text-[10px] text-emerald-600 font-medium">{isRTL ? 'خصم' : 'OFF'}</p>
              </div>
            )}
          </div>

          {/* Auto-update */}
          <div className={clsx('rounded-xl border p-3 cursor-pointer transition-colors',
            autoDiscount ? 'border-emerald-300 bg-white' : 'border-gray-200 bg-white/60'
          )}>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={autoDiscount} onChange={e => onAutoDiscount(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-emerald-600 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-800">
                  {isRTL ? 'رفع الخصم تلقائياً مع اقتراب الانتهاء' : 'Auto-raise discount as expiry nears'}
                </p>
                {autoDiscount && (
                  <div className="flex gap-1.5 mt-2">
                    {([{ d: 90, p: 5, c: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
                       { d: 60, p: 10, c: 'bg-orange-100 text-orange-700 border-orange-200' },
                       { d: 30, p: 15, c: 'bg-red-100 text-red-700 border-red-200' }]).map(({ d, p, c }) => (
                      <div key={d} className={clsx('border rounded-lg px-2 py-1 text-center min-w-[48px]', c)}>
                        <p className="text-sm font-bold leading-none">{p}%</p>
                        <p className="text-[9px] opacity-70 mt-0.5">{isRTL ? `< ${d}ي` : `< ${d}d`}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </label>
          </div>

          {listingType === 'clearance' && (!discountPct || parseFloat(discountPct) <= 0) && (
            <p className="text-xs text-red-500 flex items-center gap-1.5">
              <AlertCircle size={12} />
              {isRTL ? 'الخصم مطلوب لإعلانات التصفية' : 'Discount required for clearance listings'}
            </p>
          )}
        </div>
      )}

      {/* Bonus panel */}
      {offerMode === 'bonus' && (
        <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                {isRTL ? 'الكمية المطلوبة للبونص' : 'Required qty for bonus'}
              </label>
              <input type="number" min="1" value={bonusReqQty} onChange={e => onBonusReqQty(e.target.value)}
                placeholder={isRTL ? 'مثال: 10' : 'e.g. 10'}
                className="w-full border border-purple-200 rounded-xl px-3 py-2.5 text-lg font-bold text-center bg-white focus:ring-2 focus:ring-purple-400 outline-none" />
              <p className="text-[10px] text-gray-400 mt-1">
                {isRTL ? 'موصى به +1 كمية' : 'Tip: min order qty + 1'}
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                {isRTL ? 'كمية البوانص' : 'Bonus qty'}
              </label>
              <input type="number" min="1" value={bonusQty} onChange={e => onBonusQty(e.target.value)}
                placeholder={isRTL ? 'مثال: 1' : 'e.g. 1'}
                className="w-full border border-purple-200 rounded-xl px-3 py-2.5 text-lg font-bold text-center bg-white focus:ring-2 focus:ring-purple-400 outline-none" />
            </div>
          </div>

          {bonusReqQty && bonusQty && (
            <div className="bg-white border-2 border-purple-200 rounded-xl p-3 flex items-center gap-3">
              <span className="text-2xl shrink-0">🎁</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">
                  {isRTL
                    ? `اشترِ ${bonusReqQty} ${parseInt(bonusReqQty) > 1 ? 'علب' : 'علبة'} ← احصل على ${bonusQty} مجاناً`
                    : `Buy ${bonusReqQty} → get ${bonusQty} FREE`}
                </p>
                {effectivePct && (
                  <p className="text-xs text-purple-500 mt-0.5">
                    {isRTL ? `خصم فعلي: ${effectivePct}%` : `Effective discount: ${effectivePct}%`}
                  </p>
                )}
              </div>
              <span className="shrink-0 bg-purple-600 text-white text-[10px] font-bold rounded-full px-2 py-1">FREE</span>
            </div>
          )}

          <p className="text-[11px] text-purple-500 flex items-center gap-1.5">
            <Sparkles size={10} />
            {isRTL
              ? 'البوانص تزيد حجم الطلبات بنسبة تصل إلى 3× مقارنة بالخصم المباشر'
              : 'Bonus packs drive 3× larger orders vs. plain discounts'}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Listing Success Modal ─────────────────────────────────────────────────────
function ListingSuccessModal({ isRTL, item, price, quantity, listingType, offerMode,
  discountPct, bonusReqQty, bonusQty, onClose, onAddAnother }: {
  isRTL: boolean
  item: InventoryItem
  price: string
  quantity: string
  listingType: 'normal' | 'clearance' | 'emergency'
  offerMode: OfferMode
  discountPct: string
  bonusReqQty: string
  bonusQty: string
  onClose: () => void
  onAddAnother: () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { requestAnimationFrame(() => setMounted(true)) }, [])

  const TYPE_META = {
    normal:    { label: isRTL ? 'عادي'       : 'Normal',    emoji: '📦', cls: 'bg-gray-100 text-gray-700' },
    clearance: { label: isRTL ? 'تصفية'      : 'Clearance', emoji: '🔥', cls: 'bg-orange-100 text-orange-700' },
    emergency: { label: isRTL ? 'متاح فوري'  : 'Emergency', emoji: '⚡', cls: 'bg-blue-100 text-blue-700' },
  }
  const tm = TYPE_META[listingType]

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className={clsx(
        'bg-white rounded-2xl w-full max-w-sm mx-4 shadow-2xl transition-all duration-300',
        mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95',
      )}>
        {/* Gradient header */}
        <div className="bg-gradient-to-br from-emerald-500 to-violet-600 rounded-t-2xl px-6 pt-6 pb-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
          <div className={clsx(
            'w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg transition-all duration-500',
            mounted ? 'scale-100 rotate-0' : 'scale-0 rotate-180'
          )}>
            <CheckCircle2 size={34} className="text-emerald-500" />
          </div>
          <h2 className="text-white font-bold text-lg leading-tight">
            {isRTL ? 'تم نشر إعلانك بنجاح! 🎉' : 'Listing Published! 🎉'}
          </h2>
          <p className="text-emerald-100 text-xs mt-1">
            {isRTL ? 'إعلانك الآن مرئي للصيدليات الأخرى' : 'Visible to all pharmacies on the network'}
          </p>
        </div>

        {/* Pulled-up product card */}
        <div className="-mt-4 mx-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
              <Package size={18} className="text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm truncate">{item.product?.name}</p>
              {item.product?.barcode && (
                <p className="text-[11px] text-gray-400 font-mono mt-0.5">{item.product.barcode}</p>
              )}
            </div>
            <span className={clsx('text-xs font-semibold px-2 py-1 rounded-full', tm.cls)}>
              {tm.emoji} {tm.label}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded-xl p-2.5 text-center border border-gray-100">
              <p className="text-[10px] text-gray-400">{isRTL ? 'السعر' : 'Price'}</p>
              <p className="text-lg font-extrabold text-gray-900 leading-tight">{price}</p>
              <p className="text-[10px] text-gray-400">{isRTL ? 'ر.س' : 'SAR'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-2.5 text-center border border-gray-100">
              <p className="text-[10px] text-gray-400">{isRTL ? 'الكمية' : 'Qty'}</p>
              <p className="text-lg font-extrabold text-gray-900 leading-tight">{quantity}</p>
              <p className="text-[10px] text-gray-400">{isRTL ? 'علبة' : 'units'}</p>
            </div>
          </div>

          {offerMode === 'discount' && discountPct && parseFloat(discountPct) > 0 && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              <span className="text-xl font-black text-emerald-600">{Math.round(parseFloat(discountPct))}%</span>
              <span className="text-xs text-emerald-700">{isRTL ? 'خصم مباشر' : 'direct discount'}</span>
            </div>
          )}
          {offerMode === 'bonus' && bonusReqQty && bonusQty && (
            <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-xl px-3 py-2">
              <span className="text-xl">🎁</span>
              <span className="text-xs text-purple-700 font-medium">
                {isRTL
                  ? `اشترِ ${bonusReqQty} ← احصل على ${bonusQty} مجاناً`
                  : `Buy ${bonusReqQty} → get ${bonusQty} free`}
              </span>
            </div>
          )}
        </div>

        {/* CTAs */}
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={onAddAnother}
            className="py-2.5 border-2 border-emerald-200 text-emerald-700 rounded-xl text-sm font-semibold hover:bg-emerald-50 transition-colors">
            {isRTL ? '+ إعلان جديد' : '+ Add another'}
          </button>
          <button onClick={onClose}
            className="py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors">
            {isRTL ? 'عرض إعلاناتي' : 'View listings'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Listing Form ──────────────────────────────────────────────────────────
function AddListingForm({ isRTL, onClose, onCreated, initialInventoryItemId }: {
  isRTL: boolean
  onClose: () => void
  onCreated: () => void
  initialInventoryItemId?: string
}) {
  const qc = useQueryClient()
  const [selectedItem, setSelectedItem]     = useState<InventoryItem | null>(null)
  const [price, setPrice]                   = useState('')
  const [priceSuggested, setPriceSuggested] = useState(false)
  const [quantity, setQuantity]             = useState('')
  const [minOrderQty, setMinOrderQty]       = useState('1')
  const [listingType, setListingType]       = useState<'normal' | 'clearance' | 'emergency'>('normal')
  const [typeSuggested, setTypeSuggested]   = useState(false)
  const [offerMode, setOfferMode]           = useState<OfferMode>('none')
  const [discountPct, setDiscountPct]       = useState('')
  const [autoDiscount, setAutoDiscount]     = useState(false)
  const [bonusReqQty, setBonusReqQty]       = useState('')
  const [bonusQty, setBonusQty]             = useState('')
  const [rulesResult, setRulesResult]       = useState<any>(null)
  const [validating, setValidating]         = useState(false)
  const [showSuccess, setShowSuccess]       = useState(false)
  const [dupWarning, setDupWarning]         = useState(false)

  // Load own listings once for duplicate detection
  const { data: ownListings = [] } = useQuery({
    queryKey: ['p2p-own-listings'],
    queryFn: () => p2pListingApi.list({ limit: 200 }).then((r: any) => r.data ?? r ?? []),
    staleTime: 30_000,
  })

  const resetOfferState = () => {
    setOfferMode('none'); setDiscountPct(''); setAutoDiscount(false)
    setBonusReqQty(''); setBonusQty('')
  }

  const handleItemChange = useCallback((item: InventoryItem | null) => {
    setSelectedItem(item); setRulesResult(null); setDupWarning(false)
    if (!item) {
      setPrice(''); setPriceSuggested(false); setQuantity('')
      setListingType('normal'); setTypeSuggested(false)
      resetOfferState(); return
    }
    // Duplicate check — active listing for same inventoryItemId
    const existing = (ownListings as any[]).find(
      l => l.inventoryItemId === item.id && l.status === 'active'
    )
    if (existing) { setDupWarning(true) }

    if (item.sellingPrice) { setPrice(String(item.sellingPrice)); setPriceSuggested(true) }
    else setPriceSuggested(false)
    setQuantity(String(Math.max(1, item.quantity)))
    const suggested = suggestListingType(item)
    setListingType(suggested); setTypeSuggested(suggested !== 'normal')
    const days = itemDaysLeft(item)
    if (days !== null && days <= 90 && days > 0) {
      setOfferMode('discount'); setAutoDiscount(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownListings])

  // Pre-select item when coming from expiry alert CTA
  const { data: inventoryForPreselect } = useQuery({
    queryKey: ['inventory-preselect', initialInventoryItemId],
    queryFn: () => inventoryApi.getAll().then((r: any) => Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : [])) as Promise<InventoryItem[]>,
    enabled: !!initialInventoryItemId && !selectedItem,
    staleTime: 60_000,
  })
  useEffect(() => {
    if (initialInventoryItemId && inventoryForPreselect && !selectedItem) {
      const found = (inventoryForPreselect as InventoryItem[]).find(it => it.id === initialInventoryItemId)
      if (found) handleItemChange(found)
    }
  }, [initialInventoryItemId, inventoryForPreselect, selectedItem, handleItemChange])

  const inventoryItemId = selectedItem?.id ?? ''
  const expiryDate      = selectedItem?.expiryDate ?? ''

  const createMutation = useMutation({
    mutationFn: () => p2pListingApi.create({
      inventoryItemId,
      price: parseFloat(price),
      quantity: parseInt(quantity),
      minOrderQty: offerMode === 'bonus' && bonusReqQty ? parseInt(bonusReqQty) : parseInt(minOrderQty) || 1,
      expiryDate: expiryDate || undefined,
      listingType,
      offerType: offerMode,
      discountPct: offerMode === 'discount' && discountPct ? parseFloat(discountPct) : undefined,
      autoUpdateDiscount: offerMode === 'discount' ? autoDiscount : false,
      bonusQty: offerMode === 'bonus' && bonusQty ? parseInt(bonusQty) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['p2p-own-listings'] })
      setShowSuccess(true)
    },
  })

  const validate = useCallback(async () => {
    if (!inventoryItemId || !price || !quantity) return
    setValidating(true)
    try {
      const result = await p2pListingApi.validate({
        inventoryItemId,
        price: parseFloat(price),
        quantity: parseInt(quantity),
        minOrderQty: parseInt(minOrderQty) || 1,
        expiryDate: expiryDate || undefined,
        listingType,
      })
      setRulesResult(result)
    } catch { /* ignore */ } finally { setValidating(false) }
  }, [inventoryItemId, price, quantity, minOrderQty, expiryDate, listingType])

  useEffect(() => {
    const t = setTimeout(validate, 600)
    return () => clearTimeout(t)
  }, [validate])

  const handleInlineFix = (field: string, value: string | number) => {
    if (field === 'price') setPrice(String(value))
    else if (field === 'minOrderQty') setMinOrderQty(String(value))
    else if (field === 'discountPct') { setDiscountPct(String(value)); setOfferMode('discount') }
    setTimeout(validate, 100)
  }

  const LABEL = 'block text-xs font-semibold text-gray-600 mb-1.5'
  const maxQty = selectedItem?.quantity ?? 9999
  const hasLocalBlockingIssue = selectedItem ? getItemIssues(selectedItem).some(i => i.blocking) : false

  // Clearance requires a discount offer
  const clearanceNeedsDiscount =
    listingType === 'clearance' && offerMode === 'discount' && (!discountPct || parseFloat(discountPct) <= 0)
  // Bonus offer needs both fields
  const bonusIncomplete = offerMode === 'bonus' && (!bonusReqQty || !bonusQty)
  const canPublish = !hasLocalBlockingIssue
    && !clearanceNeedsDiscount
    && !bonusIncomplete
    && (rulesResult?.canPublish ?? (!validating && !!price && !!quantity))

  const handleSuccessClose = () => { setShowSuccess(false); onCreated() }
  const handleAddAnother   = () => {
    setShowSuccess(false); setSelectedItem(null); setPrice(''); setQuantity('')
    setMinOrderQty('1'); setListingType('normal'); setTypeSuggested(false)
    setRulesResult(null); resetOfferState()
  }

  return (
    <>
      {showSuccess && selectedItem && (
        <ListingSuccessModal
          isRTL={isRTL} item={selectedItem} price={price} quantity={quantity}
          listingType={listingType} offerMode={offerMode}
          discountPct={discountPct} bonusReqQty={bonusReqQty} bonusQty={bonusQty}
          onClose={handleSuccessClose} onAddAnother={handleAddAnother}
        />
      )}

      <div className="bg-white rounded-2xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">{isRTL ? 'إضافة إعلان جديد' : 'New Listing'}</h3>
            {!selectedItem && (
              <p className="text-xs text-gray-400 mt-0.5">
                {isRTL ? 'ابحث عن منتج في مخزونك للبدء' : 'Search your inventory to get started'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* ── Step 1: Pick product ── */}
          <div>
            <label className={LABEL}>{isRTL ? 'المنتج' : 'Product'}</label>
            <InventoryPicker value={selectedItem} onChange={handleItemChange} isRTL={isRTL} qc={qc} />
          </div>

          {/* Duplicate warning */}
          {dupWarning && selectedItem && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-800">
                  {isRTL ? 'لديك إعلان نشط لهذا المنتج بالفعل' : 'You already have an active listing for this product'}
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  {isRTL
                    ? 'يمكنك المتابعة لإنشاء إعلان ثانٍ بسعر مختلف، أو العودة وتعديل الإعلان الحالي'
                    : 'You can continue to create a second listing at a different price, or go back and edit the existing one'}
                </p>
              </div>
              <button onClick={() => setDupWarning(false)} className="text-amber-400 hover:text-amber-600 shrink-0">
                <X size={13} />
              </button>
            </div>
          )}

          {/* ── Step 2: Details (only after item selected, no blocking issue) ── */}
          {selectedItem && !hasLocalBlockingIssue && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Price */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className={LABEL.replace(' mb-1.5', '')}>{isRTL ? 'السعر' : 'Price'}</label>
                    {priceSuggested && (
                      <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                        <Sparkles size={9} /> {isRTL ? 'من سعر البيع الحالي' : 'From current selling price'}
                      </span>
                    )}
                  </div>
                  <input type="number" min="0.01" step="0.01" value={price}
                    onChange={e => { setPrice(e.target.value); setPriceSuggested(false) }}
                    className={INPUT} placeholder="0.00" />
                </div>

                {/* Quantity */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className={LABEL.replace(' mb-1.5', '')}>{isRTL ? 'الكمية للبيع' : 'Qty to sell'}</label>
                    <span className="text-[10px] text-gray-400">
                      {isRTL ? `من أصل ${maxQty} علبة` : `of ${maxQty} available`}
                    </span>
                  </div>
                  <input type="number" min="1" max={maxQty} value={quantity}
                    onChange={e => setQuantity(e.target.value)} className={INPUT} />
                  {quantity && (
                    <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (parseInt(quantity) / maxQty) * 100)}%` }} />
                    </div>
                  )}
                </div>

                {/* Min order (only show when not bonus mode — bonus takes over minOrderQty) */}
                {offerMode !== 'bonus' && (
                  <div>
                    <label className={LABEL}>{isRTL ? 'أقل كمية للطلب' : 'Min order qty'}</label>
                    <input type="number" min="1" value={minOrderQty}
                      onChange={e => setMinOrderQty(e.target.value)} className={INPUT} />
                  </div>
                )}

                {/* Listing type */}
                <div className={offerMode !== 'bonus' ? '' : 'md:col-span-2'}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className={LABEL.replace(' mb-1.5', '')}>{isRTL ? 'نوع الإعلان' : 'Listing type'}</label>
                    {typeSuggested && (
                      <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                        <Sparkles size={9} /> {isRTL ? 'اقتراح تلقائي' : 'Auto-suggested'}
                      </span>
                    )}
                  </div>
                  <select value={listingType}
                    onChange={e => { setListingType(e.target.value as any); setTypeSuggested(false) }}
                    className={clsx(INPUT, 'appearance-none')}>
                    <option value="normal">{isRTL ? '📦 عادي — منتج متاح للبيع' : '📦 Normal — available for sale'}</option>
                    <option value="clearance">🔥 {isRTL ? 'تصفية — قريب من الانتهاء' : 'Clearance — near expiry'}</option>
                    <option value="emergency">⚡ {isRTL ? 'متاح فوري — كميات محدودة' : 'Emergency — limited qty'}</option>
                  </select>
                </div>
              </div>

              {/* ── Offer Builder ── */}
              <OfferBuilder
                isRTL={isRTL}
                offerMode={offerMode} onOfferMode={setOfferMode}
                discountPct={discountPct} onDiscountPct={setDiscountPct}
                autoDiscount={autoDiscount} onAutoDiscount={setAutoDiscount}
                bonusReqQty={bonusReqQty} onBonusReqQty={setBonusReqQty}
                bonusQty={bonusQty} onBonusQty={setBonusQty}
                listingType={listingType}
              />

              {/* Backend validation panel */}
              <ProductRulesPanel result={rulesResult} isLoading={validating} onInlineFix={handleInlineFix} />

              {createMutation.isError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {(createMutation.error as any)?.response?.data?.message ?? (isRTL ? 'حدث خطأ' : 'Error')}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending || !canPublish}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {createMutation.isPending
                    ? (isRTL ? 'جاري النشر...' : 'Publishing...')
                    : (isRTL ? 'نشر الإعلان' : 'Publish Listing')}
                </button>
                <button onClick={onClose} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </>
          )}

          {!selectedItem && (
            <div className="text-center py-8 text-gray-400">
              <Package size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{isRTL ? 'اختر منتجاً للمتابعة' : 'Select a product to continue'}</p>
            </div>
          )}

          {selectedItem && hasLocalBlockingIssue && (
            <div className="flex gap-3 pt-2">
              <button onClick={() => handleItemChange(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                {isRTL ? '← اختر منتجاً آخر' : '← Pick a different product'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Modern listings table (replaces basic card grid) ──────────────────────────
function MyListingsTable({ listings, isRTL }: { listings: P2pListing[]; isRTL: boolean }) {
  const qc = useQueryClient()

  const STATUS_CFG: Record<string, { cls: string; ar: string; en: string; dot: string }> = {
    active:   { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', ar: 'نشط',    en: 'Active'   },
    paused:   { cls: 'bg-gray-100 text-gray-600 border-gray-200',           dot: 'bg-gray-400',   ar: 'موقوف',  en: 'Paused'   },
    inactive: { cls: 'bg-gray-100 text-gray-600 border-gray-200',           dot: 'bg-gray-400',   ar: 'غير نشط',en: 'Inactive' },
    sold_out: { cls: 'bg-blue-100 text-blue-700 border-blue-200',           dot: 'bg-blue-500',   ar: 'نفدت',   en: 'Sold out' },
    expired:  { cls: 'bg-red-100 text-red-600 border-red-200',              dot: 'bg-red-500',    ar: 'منتهي',  en: 'Expired'  },
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Table header */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" dir={isRTL ? 'rtl' : 'ltr'}>
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              <th className="text-start px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                {isRTL ? 'معرف القائمة' : 'Listing ID'}
              </th>
              <th className="text-start px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                {isRTL ? 'المنتج' : 'Product'}
              </th>
              <th className="text-start px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                {isRTL ? 'تاريخ الإنشاء' : 'Created'}
              </th>
              <th className="text-start px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                {isRTL ? 'النوع' : 'Type'}
              </th>
              <th className="text-start px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                {isRTL ? 'تاريخ الانتهاء' : 'Expiry'}
              </th>
              <th className="text-end px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                {isRTL ? 'الكمية' : 'Qty'}
              </th>
              <th className="text-end px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                {isRTL ? 'السعر' : 'Price'}
              </th>
              <th className="text-end px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                {isRTL ? 'الربح المقدر' : 'Est. Profit'}
              </th>
              <th className="text-start px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                {isRTL ? 'الحالة' : 'Status'}
              </th>
              <th className="text-start px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                {isRTL ? 'الخصم التلقائي' : 'Auto Discount'}
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                {isRTL ? 'الإجراءات' : 'Actions'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {listings.map((listing, idx) => (
              <MyListingRow key={listing.id} listing={listing} idx={idx} isRTL={isRTL} qc={qc} statusCfg={STATUS_CFG} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── VIEW LISTING MODAL ────────────────────────────────────────────────────────

function ViewListingModal({ listing, isRTL, onClose, statusCfg }: {
  listing: P2pListing
  isRTL: boolean
  onClose: () => void
  statusCfg: Record<string, { cls: string; ar: string; en: string; dot: string }>
}) {
  const cfg = statusCfg[listing.status] ?? statusCfg.paused
  const days = daysLeft(listing.expiryDate)
  const shortId = `LST-${listing.id.slice(-4).toUpperCase()}`
  const { currency } = useCurrency()
  const productName = isRTL ? (listing.productNameAr || listing.productName) : listing.productName
  const typeLabels = { normal: { ar: 'عادي', en: 'Normal' }, clearance: { ar: 'تصفية', en: 'Clearance' }, emergency: { ar: 'طارئ', en: 'Emergency' } }
  const typeIcons = { normal: null, clearance: '🔥', emergency: '⚡' }
  const typeCls = { normal: 'bg-gray-100 text-gray-600', clearance: 'bg-orange-100 text-orange-700', emergency: 'bg-red-100 text-red-700' }

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 font-mono">{shortId}</p>
            <h2 className="text-base font-bold text-gray-900">{isRTL ? 'تفاصيل الإعلان' : 'Listing Details'}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Product */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-1">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{isRTL ? 'المنتج' : 'Product'}</p>
            <p className="font-semibold text-gray-900 text-sm">{productName || (isRTL ? 'غير محدد' : 'Unknown')}</p>
            {listing.productCode && (
              <span className="inline-block text-[11px] text-gray-500 font-mono bg-gray-200 px-2 py-0.5 rounded">
                {isRTL ? 'كود: ' : 'Code: '}{listing.productCode}
              </span>
            )}
          </div>

          {/* Status + Type row */}
          <div className="flex flex-wrap gap-2">
            <span className={clsx('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold', cfg.cls)}>
              <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
              {isRTL ? cfg.ar : cfg.en}
            </span>
            <span className={clsx('inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold', typeCls[listing.listingType])}>
              {typeIcons[listing.listingType] && <span>{typeIcons[listing.listingType]}</span>}
              {isRTL ? typeLabels[listing.listingType].ar : typeLabels[listing.listingType].en}
            </span>
          </div>

          {/* Price / Qty grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: isRTL ? 'السعر' : 'Price', value: `${Number(listing.price).toFixed(2)} ${currency}` },
              { label: isRTL ? 'الكمية' : 'Qty', value: `${listing.quantity}` },
              { label: isRTL ? 'الحد الأدنى' : 'Min Order', value: `${listing.minOrderQty}` },
            ].map(f => (
              <div key={f.label} className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-400 mb-1">{f.label}</p>
                <p className="font-semibold text-gray-900 text-sm">{f.value}</p>
              </div>
            ))}
          </div>

          {/* Offer */}
          {listing.offerType !== 'none' && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <span className="text-emerald-600 font-bold text-sm">
                {listing.offerType === 'discount'
                  ? `${listing.discountPct}% ${isRTL ? 'خصم' : 'discount'}${listing.autoUpdateDiscount ? ' 🤖' : ''}`
                  : `🎁 ${isRTL ? 'بوانص' : 'Bonus'} +${listing.bonusQty}`
                }
              </span>
            </div>
          )}

          {/* Expiry */}
          {listing.expiryDate && (
            <div className={clsx(
              'flex items-center justify-between rounded-xl px-4 py-3',
              days !== null && days < 0 ? 'bg-red-50 border border-red-200'
              : days !== null && days <= 30 ? 'bg-orange-50 border border-orange-200'
              : 'bg-gray-50'
            )}>
              <span className="text-xs text-gray-500">{isRTL ? 'تاريخ الانتهاء' : 'Expiry date'}</span>
              <span className={clsx('text-sm font-semibold',
                days !== null && days < 0 ? 'text-red-600'
                : days !== null && days <= 30 ? 'text-orange-600'
                : 'text-gray-700'
              )}>
                {new Date(listing.expiryDate).toLocaleDateString(isRTL ? 'ar-EG' : 'en-GB')}
                {days !== null && (
                  <span className="ms-2 text-xs font-normal">
                    ({days < 0 ? (isRTL ? 'منتهي' : 'Expired') : `${days}d`})
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Dates */}
          <div className="text-xs text-gray-400 flex justify-between border-t border-gray-100 pt-3">
            <span>{isRTL ? 'أُنشئ: ' : 'Created: '}{new Date(listing.createdAt).toLocaleDateString(isRTL ? 'ar-EG' : 'en-GB')}</span>
            <span>{isRTL ? 'آخر تحديث: ' : 'Updated: '}{new Date(listing.updatedAt).toLocaleDateString(isRTL ? 'ar-EG' : 'en-GB')}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button type="button" onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold text-sm transition-colors">
            {isRTL ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── EDIT LISTING MODAL ────────────────────────────────────────────────────────

function EditListingModal({ listing, isRTL, qc, onClose }: {
  listing: P2pListing
  isRTL: boolean
  qc: ReturnType<typeof useQueryClient>
  onClose: () => void
}) {
  const productName = isRTL ? (listing.productNameAr || listing.productName) : listing.productName
  const { currency } = useCurrency()

  const [form, setForm] = useState({
    price:              String(listing.price),
    quantity:           String(listing.quantity),
    minOrderQty:        String(listing.minOrderQty ?? 1),
    expiryDate:         listing.expiryDate ? listing.expiryDate.toString().slice(0, 10) : '',
    listingType:        listing.listingType as 'normal' | 'clearance' | 'emergency',
    offerType:          listing.offerType as 'none' | 'discount' | 'bonus',
    discountPct:        String(listing.discountPct ?? ''),
    bonusQty:           String(listing.bonusQty ?? ''),
    autoUpdateDiscount: listing.autoUpdateDiscount,
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))

  const updateMutation = useMutation({
    mutationFn: () => p2pListingApi.update(listing.id, {
      price:              parseFloat(form.price),
      quantity:           parseInt(form.quantity),
      minOrderQty:        parseInt(form.minOrderQty) || 1,
      expiryDate:         form.expiryDate || undefined,
      listingType:        form.listingType,
      offerType:          form.offerType,
      discountPct:        form.offerType === 'discount' ? parseFloat(form.discountPct) || undefined : undefined,
      bonusQty:           form.offerType === 'bonus'    ? parseInt(form.bonusQty) || undefined   : undefined,
      autoUpdateDiscount: form.autoUpdateDiscount,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['p2p-my-listings'] })
      onClose()
    },
  })

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1.5'

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 overflow-y-auto" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">{isRTL ? 'تعديل الإعلان' : 'Edit Listing'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{productName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          {/* Price / Qty / Min row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>{isRTL ? `السعر (${currency})` : `Price (${currency})`}</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={set('price')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{isRTL ? 'الكمية' : 'Quantity'}</label>
              <input type="number" min="1" value={form.quantity} onChange={set('quantity')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{isRTL ? 'الحد الأدنى' : 'Min Order'}</label>
              <input type="number" min="1" value={form.minOrderQty} onChange={set('minOrderQty')} className={inputCls} />
            </div>
          </div>

          {/* Expiry + Type row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{isRTL ? 'تاريخ الانتهاء' : 'Expiry Date'}</label>
              <input type="date" value={form.expiryDate} onChange={set('expiryDate')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{isRTL ? 'نوع الإعلان' : 'Listing Type'}</label>
              <select value={form.listingType} onChange={set('listingType')} className={inputCls}>
                <option value="normal">{isRTL ? 'عادي' : 'Normal'}</option>
                <option value="clearance">{isRTL ? '🔥 تصفية' : '🔥 Clearance'}</option>
                <option value="emergency">{isRTL ? '⚡ طارئ' : '⚡ Emergency'}</option>
              </select>
            </div>
          </div>

          {/* Offer type */}
          <div>
            <label className={labelCls}>{isRTL ? 'نوع العرض' : 'Offer Type'}</label>
            <div className="flex gap-2">
              {(['none', 'discount', 'bonus'] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => setForm(f => ({ ...f, offerType: t }))}
                  className={clsx(
                    'flex-1 py-2 rounded-xl text-xs font-semibold border transition-all',
                    form.offerType === t
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400',
                  )}>
                  {t === 'none' ? (isRTL ? 'بدون' : 'None') : t === 'discount' ? (isRTL ? '% خصم' : 'Discount %') : (isRTL ? '🎁 بوانص' : '🎁 Bonus')}
                </button>
              ))}
            </div>
          </div>

          {form.offerType === 'discount' && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{isRTL ? 'نسبة الخصم %' : 'Discount %'}</label>
                <input type="number" min="1" max="90" value={form.discountPct} onChange={set('discountPct')} className={inputCls} />
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={form.autoUpdateDiscount}
                  onChange={e => setForm(f => ({ ...f, autoUpdateDiscount: e.target.checked }))}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-violet-500" />
                <span className="text-sm text-gray-700">{isRTL ? 'تحديث الخصم تلقائياً قرب تاريخ الانتهاء' : 'Auto-update discount near expiry'}</span>
              </label>
            </div>
          )}

          {form.offerType === 'bonus' && (
            <div>
              <label className={labelCls}>{isRTL ? 'كمية البوانص' : 'Bonus Quantity'}</label>
              <input type="number" min="1" value={form.bonusQty} onChange={set('bonusQty')} className={inputCls} />
            </div>
          )}

          {/* Error */}
          {updateMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {(updateMutation.error as any)?.response?.data?.message ?? (isRTL ? 'حدث خطأ، حاول مجدداً' : 'Update failed, please try again')}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors">
            {isRTL ? 'إلغاء' : 'Cancel'}
          </button>
          <button type="button"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            className="flex-1 py-2.5 rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-semibold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {updateMutation.isPending
              ? <><Loader2 size={15} className="animate-spin" />{isRTL ? 'جاري الحفظ...' : 'Saving...'}</>
              : <>{isRTL ? 'حفظ التعديلات' : 'Save Changes'}</>
            }
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function MyListingRow({ listing, idx, isRTL, qc, statusCfg }: {
  listing: P2pListing; idx: number; isRTL: boolean
  qc: ReturnType<typeof useQueryClient>
  statusCfg: Record<string, { cls: string; ar: string; en: string; dot: string }>
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos]   = useState<{ top: number; right: number } | null>(null)
  const [showView, setShowView] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const { currency } = useCurrency()

  const openMenu = () => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const MENU_W = 208
    const MENU_H = 160
    const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8))
    const flipUp = r.bottom + MENU_H > window.innerHeight - 8
    setMenuPos({ top: flipUp ? r.top - MENU_H - 4 : r.bottom + 4, right: window.innerWidth - r.right })
    setMenuOpen(true)
  }

  const pauseMutation = useMutation({
    mutationFn: () => listing.status === 'active' ? p2pListingApi.pause(listing.id) : p2pListingApi.resume(listing.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['p2p-my-listings'] }),
  })
  const deleteMutation = useMutation({
    mutationFn: () => p2pListingApi.remove(listing.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['p2p-my-listings'] }),
  })

  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => {
      const el = document.getElementById(`menu-${listing.id}`)
      if (!el?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen, listing.id])

  const days = daysLeft(listing.expiryDate)
  const statusKey = listing.status as string
  const cfg = statusCfg[statusKey] ?? statusCfg.paused
  const shortId = `LST-${listing.id.slice(-4).toUpperCase()}`

  // Expiry chip color
  const expiryColor = days === null ? 'text-gray-400'
    : days < 0 ? 'text-red-600 font-semibold'
    : days <= 30 ? 'text-red-500 font-medium'
    : days <= 90 ? 'text-amber-600 font-medium'
    : 'text-gray-500'

  const expiryText = listing.expiryDate
    ? (days !== null && days < 0
        ? (isRTL ? 'منتهي' : 'Expired')
        : new Date(listing.expiryDate).toLocaleDateString(isRTL ? 'ar-EG' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))
    : '—'

  const expiryBadge = days !== null && days >= 0 && days <= 90
    ? (isRTL ? `قريب من الانتهاء` : 'Near expiry')
    : null

  const productName = listing.productNameAr || listing.productName || '—'
  const productCode = listing.productCode

  return (
    <>
    <tr className="hover:bg-gray-50/60 transition-colors group">
      {/* Listing ID */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span className="text-xs font-bold text-emerald-600 font-mono bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
          {shortId}
        </span>
      </td>

      {/* Product */}
      <td className="px-4 py-3.5 min-w-[180px]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-50 to-violet-50 border border-gray-100 flex items-center justify-center shrink-0">
            <Package size={15} className="text-emerald-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate max-w-[160px]">{productName}</p>
            {productCode && (
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                {isRTL ? 'كود المنتج: ' : 'Code: '}{productCode}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Created date */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <p className="text-xs text-gray-600">
          {new Date(listing.createdAt).toLocaleDateString(isRTL ? 'ar-EG' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {new Date(listing.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </td>

      {/* Type */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <ListingTypeBadge type={listing.listingType} />
        {listing.listingType === 'normal' && (
          <span className="text-[10px] text-gray-400">{isRTL ? 'عادي' : 'Normal'}</span>
        )}
      </td>

      {/* Expiry */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <p className={clsx('text-xs', expiryColor)}>{expiryText}</p>
        {expiryBadge && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 font-medium mt-0.5 inline-block">
            {expiryBadge}
          </span>
        )}
      </td>

      {/* Qty */}
      <td className="px-4 py-3.5 text-end whitespace-nowrap">
        <p className="text-sm font-bold text-gray-900">{listing.quantity}</p>
        {listing.minOrderQty > 1 && (
          <p className="text-[10px] text-gray-400">{isRTL ? `دقيقة ${listing.minOrderQty}` : `min ${listing.minOrderQty}`}</p>
        )}
      </td>

      {/* Price */}
      <td className="px-4 py-3.5 text-end whitespace-nowrap">
        <p className="text-sm font-bold text-gray-900">{Number(listing.price).toFixed(2)}</p>
        <p className="text-[10px] text-gray-400">{currency}</p>
      </td>

      {/* Est. Profit */}
      <td className="px-4 py-3.5 text-end whitespace-nowrap">
        {listing.costPrice != null ? (() => {
          const margin = (Number(listing.price) - listing.costPrice) * listing.quantity
          const isLoss = margin < 0
          return (
            <>
              <p className={clsx('text-sm font-semibold tabular-nums', isLoss ? 'text-red-500' : 'text-emerald-600')}>
                {isLoss ? '−' : ''}{Math.abs(margin).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-gray-400">{isRTL ? 'الربح المقدر' : 'est. profit'}</p>
            </>
          )
        })() : (
          <>
            <p className="text-sm text-gray-300">—</p>
            <p className="text-[10px] text-gray-400">{isRTL ? 'لا يوجد سعر تكلفة' : 'no cost price'}</p>
          </>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span className={clsx('inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-semibold border', cfg.cls)}>
          <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
          {isRTL ? cfg.ar : cfg.en}
        </span>
      </td>

      {/* Auto Discount */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        {listing.offerType === 'discount' && listing.discountPct ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-emerald-600">{listing.discountPct}%</span>
            {listing.autoUpdateDiscount && (
              <span className="text-[9px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full font-semibold">AUTO</span>
            )}
          </div>
        ) : listing.offerType === 'bonus' && listing.bonusQty ? (
          <span className="text-[10px] text-purple-600 font-semibold">🎁 بوانص</span>
        ) : (
          <span className="text-[10px] text-gray-300">—</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <button
          ref={btnRef}
          type="button"
          onClick={openMenu}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors opacity-0 group-hover:opacity-100"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/>
          </svg>
        </button>

        {/* Portalled dropdown — renders to document.body to escape table overflow/transform */}
        {menuOpen && menuPos && createPortal(
          <div
            id={`menu-${listing.id}`}
            onMouseDown={e => e.stopPropagation()}
            style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
            className="w-52 bg-white border border-gray-200 rounded-2xl shadow-2xl py-1.5 overflow-hidden"
            dir="rtl"
          >
            <button type="button" onClick={() => { setShowView(true); setMenuOpen(false) }}
              className="w-full text-start px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
              <Eye size={14} className="text-gray-400 shrink-0" />
              {isRTL ? 'عرض الإعلان' : 'View listing'}
            </button>
            {(listing.status === 'active' || listing.status === 'paused') && (
              <button type="button" onClick={() => { setShowEdit(true); setMenuOpen(false) }}
                className="w-full text-start px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                <RefreshCw size={14} className="text-blue-500 shrink-0" />
                {isRTL ? 'تعديل الإعلان' : 'Edit listing'}
              </button>
            )}
            <div className="my-1 border-t border-gray-100" />
            {(listing.status === 'active' || listing.status === 'paused') && (
              <button type="button"
                onClick={() => { pauseMutation.mutate(); setMenuOpen(false) }}
                disabled={pauseMutation.isPending}
                className="w-full text-start px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                {listing.status === 'active'
                  ? <><Eye size={14} className="text-gray-400 shrink-0" />{isRTL ? 'إيقاف مؤقت' : 'Pause listing'}</>
                  : <><CheckCircle2 size={14} className="text-emerald-500 shrink-0" />{isRTL ? 'إعادة تفعيل' : 'Resume listing'}</>}
              </button>
            )}
            <button type="button"
              onClick={() => { if (confirm(isRTL ? 'حذف هذا الإعلان؟' : 'Delete this listing?')) { deleteMutation.mutate(); setMenuOpen(false) } }}
              disabled={deleteMutation.isPending}
              className="w-full text-start px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5">
              <XCircle size={14} className="shrink-0" />
              {isRTL ? 'حذف الإعلان' : 'Delete listing'}
            </button>
          </div>,
          document.body
        )}
      </td>

    </tr>

    {/* Portalled modals — rendered outside <tr> to avoid invalid HTML */}
    {showView && (
      <ViewListingModal listing={listing} isRTL={isRTL} onClose={() => setShowView(false)} statusCfg={statusCfg} />
    )}
    {showEdit && (
      <EditListingModal listing={listing} isRTL={isRTL} qc={qc} onClose={() => setShowEdit(false)} />
    )}
  </>
  )
}

// ── ORDERS TAB ────────────────────────────────────────────────────────────────

function OrdersTab({ isRTL }: { isRTL: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const myTenantId = useProfileStore(s => s.profile?.tenantId ?? '')
  const qc = useQueryClient()

  const role = (searchParams.get('orderRole') as 'both' | 'buyer' | 'seller') ?? 'buyer'
  const statusFilter = searchParams.get('orderStatus') ?? ''
  const highlightOrderId = searchParams.get('highlight') ?? null
  const [searchQ, setSearchQ] = useState(searchParams.get('orderQ') ?? '')
  const [debouncedQ, setDebouncedQ] = useState(searchQ)
  const [ordersPage, setOrdersPage] = useState(0)
  const PAGE_SIZE = 25

  const setRole = (r: string) => {
    setOrdersPage(0)
    setSearchParams(p => { p.set('tab', 'orders'); p.set('orderRole', r); return p }, { replace: true })
  }
  const setStatusFilter = (s: string) => {
    setOrdersPage(0)
    setSearchParams(p => { s ? p.set('orderStatus', s) : p.delete('orderStatus'); return p }, { replace: true })
  }

  // Debounce both URL and actual query key — fires query only after 400ms of idle typing
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(searchQ)
      setOrdersPage(0)
      setSearchParams(p => {
        searchQ ? p.set('orderQ', searchQ) : p.delete('orderQ')
        return p
      }, { replace: true })
    }, 400)
    return () => clearTimeout(t)
  }, [searchQ]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isFetching } = useQuery({
    queryKey: ['p2p-orders', role, statusFilter, debouncedQ, ordersPage],
    queryFn: () => p2pOrdersApi.list({
      role,
      status: statusFilter || undefined,
      q: debouncedQ || undefined,
      limit: PAGE_SIZE,
      offset: ordersPage * PAGE_SIZE,
    }),
    staleTime: 20_000,           // treat data as fresh for 20s — avoids refetch on tab switch
    refetchInterval: 60_000,     // background poll every 60s (was 30s: halved the DB load)
    refetchOnWindowFocus: false, // polling handles freshness; focus-refetch is redundant here
    placeholderData: prev => prev,
  })

  const orders = data?.data ?? []
  const totalOrders = data?.total ?? 0
  const totalPages = Math.ceil(totalOrders / PAGE_SIZE)

  // Stats are computed server-side via total count; client-side from current page for display
  const pendingForMe = orders.filter(o =>
    (o.status === 'pending' && o.sellerTenantId === myTenantId) ||
    (o.status === 'accepted' && o.buyerTenantId === myTenantId),
  ).length
  const completed = orders.filter(o => o.status === 'completed').length
  const revenue = orders
    .filter(o => o.status === 'completed' && o.sellerTenantId === myTenantId)
    .reduce((sum, o) => sum + Number(o.agreedPrice) * Number(o.requestedQty), 0)

  const STATUS_OPTIONS: { value: string; ar: string }[] = [
    { value: '', ar: 'الكل' },
    { value: 'pending', ar: 'في انتظار قبول البائع' },
    { value: 'accepted', ar: 'قيد المعالجة' },
    { value: 'shipped', ar: 'تم الشحن' },
    { value: 'completed', ar: 'مكتمل' },
    { value: 'rejected', ar: 'رفضه البائع' },
    { value: 'cancelled', ar: 'تم طلب الإلغاء' },
  ]

  return (
    <div className="space-y-5">

      {/* Stats strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { labelAr: 'إجمالي الطلبات', value: data?.total ?? 0, icon: ShoppingCart, color: 'text-gray-600', bg: 'bg-gray-100' },
          { labelAr: 'تحتاج إجراءً', value: pendingForMe, icon: Clock, color: pendingForMe > 0 ? 'text-amber-600' : 'text-gray-400', bg: pendingForMe > 0 ? 'bg-amber-50' : 'bg-gray-50' },
          { labelAr: 'مكتملة', value: completed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { labelAr: 'إيراداتي (ج.م)', value: revenue.toFixed(2), icon: DollarSign, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-3">
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', s.bg)}>
              <s.icon size={18} className={s.color} />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold text-gray-900 leading-tight tabular-nums truncate">{s.value}</p>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{s.labelAr}</p>
            </div>
            {i === 1 && pendingForMe > 0 && (
              <span className="ms-auto shrink-0 w-5 h-5 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {pendingForMe}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Main card: toolbar + table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">

          {/* Role tabs */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl shrink-0">
            {([['buyer', 'طلباتي للشراء'], ['seller', 'طلبات وردت إليّ'], ['both', 'الكل']] as const).map(([r, label]) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  role === r ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search + status filter */}
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <div className="relative flex-1">
              <Search size={13} className="absolute inset-y-0 start-3 my-auto text-gray-400 pointer-events-none" />
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder={isRTL ? 'بحث بالمنتج أو رقم الطلب...' : 'Search product or order ID...'}
                className="w-full ps-8 pe-8 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 bg-gray-50"
                dir={isRTL ? 'rtl' : 'ltr'}
              />
              {!searchQ && <VoiceMicButton onResult={setSearchQ} className="absolute end-3 top-1/2 -translate-y-1/2" />}
            </div>
            <div className="relative shrink-0">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="appearance-none ps-3 pe-7 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 bg-gray-50 text-gray-700"
                dir={isRTL ? 'rtl' : 'ltr'}
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.ar}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute inset-y-0 end-2 my-auto text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Table */}
        {isFetching && !orders.length ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-emerald-500" />
          </div>
        ) : !orders.length ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <ShoppingCart size={22} className="text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-800">
              {isRTL ? 'لا توجد طلبات' : 'No orders found'}
            </p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
              {statusFilter || searchQ
                ? (isRTL ? 'جرّب تغيير الفلتر أو مصطلح البحث' : 'Try adjusting the filter or search')
                : role === 'buyer'
                  ? (isRTL ? 'لم تضع أي طلب شراء بعد — تصفح السوق واضغط "اطلب الآن"' : 'No purchase orders yet — browse the marketplace and tap Order')
                  : role === 'seller'
                  ? (isRTL ? 'لم تصلك أي طلبات من صيدليات أخرى بعد' : 'No orders received from other pharmacies yet')
                  : (isRTL ? 'لا توجد طلبات' : 'No orders found')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" dir={isRTL ? 'rtl' : 'ltr'}>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70">
                  {['#', 'المنتج', 'الطرف الآخر', 'الكمية / القيمة', 'الحالة', 'التاريخ', 'إجراءات'].map((h, i) => (
                    <th
                      key={i}
                      className={clsx(
                        'px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap',
                        i === 0 ? 'text-start' : i === 6 ? 'text-end' : 'text-start',
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map(order => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    isRTL={isRTL}
                    myTenantId={myTenantId}
                    highlight={highlightOrderId === order.id}
                    onRefresh={() => qc.invalidateQueries({ queryKey: ['p2p-orders'] })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {totalOrders > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-400">
              {isRTL
                ? `${ordersPage * PAGE_SIZE + 1}–${Math.min((ordersPage + 1) * PAGE_SIZE, totalOrders)} من ${totalOrders} طلب`
                : `${ordersPage * PAGE_SIZE + 1}–${Math.min((ordersPage + 1) * PAGE_SIZE, totalOrders)} of ${totalOrders}`}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setOrdersPage(p => Math.max(0, p - 1))}
                disabled={ordersPage === 0 || isFetching}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isRTL ? 'السابق' : 'Prev'}
              </button>
              <span className="text-xs text-gray-500 min-w-[60px] text-center">
                {ordersPage + 1} / {Math.max(1, totalPages)}
              </span>
              <button
                onClick={() => setOrdersPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={ordersPage >= totalPages - 1 || isFetching}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isRTL ? 'التالي' : 'Next'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Order Row (table row with inline actions) ─────────────────────────────────

function OrderRow({
  order, isRTL, myTenantId, highlight, onRefresh,
}: {
  order: EnrichedP2pOrder
  isRTL: boolean
  myTenantId: string
  highlight?: boolean
  onRefresh: () => void
}) {
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [expanded, setExpanded] = useState(highlight ?? false)
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [disputeType, setDisputeType] = useState('wrong_qty')
  const [disputeDesc, setDisputeDesc] = useState('')
  const countdown = useCountdown(order.status === 'accepted' ? order.reservationExpiresAt : null)

  const isSeller = order.sellerTenantId === myTenantId
  const isBuyer  = order.buyerTenantId  === myTenantId

  const [acceptDeliveryDate, setAcceptDeliveryDate] = useState('')
  const [showAcceptForm, setShowAcceptForm] = useState(false)

  const acceptM   = useMutation({
    mutationFn: () => p2pOrdersApi.accept(order.id, acceptDeliveryDate ? { expectedDeliveryAt: acceptDeliveryDate } : {}),
    onSuccess: () => { setShowAcceptForm(false); onRefresh() },
  })
  const shipM     = useMutation({ mutationFn: () => p2pOrdersApi.ship(order.id),                      onSuccess: onRefresh })
  const rejectM   = useMutation({ mutationFn: () => p2pOrdersApi.reject(order.id, rejectReason),      onSuccess: onRefresh })
  const completeM = useMutation({ mutationFn: () => p2pOrdersApi.complete(order.id),                  onSuccess: onRefresh })
  const cancelM   = useMutation({ mutationFn: () => p2pOrdersApi.cancel(order.id),   onSuccess: onRefresh })
  const disputeM  = useMutation({
    mutationFn: () => p2pOrdersApi.openDispute(order.id, { type: disputeType, description: disputeDesc }),
    onSuccess: () => { setShowDisputeForm(false); setDisputeDesc(''); onRefresh() },
  })

  const productDisplay = order.productNameAr ?? order.productName ?? null
  const counterparty   = isSeller ? order.buyerName : order.sellerName
  const totalValue     = (Number(order.agreedPrice) * Number(order.requestedQty)).toFixed(2)

  // Decide which action buttons to show
  const canAcceptReject   = isSeller && order.status === 'pending'
  const canShip           = isSeller && order.status === 'accepted'
  const canConfirmReceipt = isBuyer  && order.status === 'shipped'
  // Seller on pending: Accept or Reject only — no Cancel (that's the buyer's right)
  const canCancel         = (isBuyer && order.status === 'pending')
    || (isBuyer  && (order.status === 'accepted' || order.status === 'shipped'))
    || (isSeller && order.status === 'accepted')
  // Buyer can open a dispute if shipped and not yet completed, and no dispute exists
  const canDispute        = isBuyer && order.status === 'shipped' && !order.hasDispute
  const hasActions        = canAcceptReject || canShip || canConfirmReceipt || canCancel || canDispute

  return (
    <>
      <tr
        className={clsx(
          'hover:bg-gray-50/60 transition-colors cursor-pointer',
          expanded && 'bg-emerald-50/30',
          highlight && 'ring-2 ring-inset ring-emerald-400 bg-emerald-50/40',
        )}
        onClick={() => setExpanded(e => !e)}
      >
        {/* # */}
        <td className="px-4 py-3.5 whitespace-nowrap">
          <span className="font-mono text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
            {order.id.slice(0, 8)}
          </span>
        </td>

        {/* Product */}
        <td className="px-4 py-3.5 max-w-[200px]">
          {productDisplay ? (
            <div className="space-y-0.5">
              <p className="font-semibold text-gray-900 text-xs leading-tight line-clamp-1">{productDisplay}</p>
              {/* Code (SKU preferred, barcode fallback) */}
              {(order.productSku || order.productBarcode) && (
                <p className="font-mono text-[10px] text-gray-400">
                  كود: {order.productSku ?? order.productBarcode}
                </p>
              )}
              {/* Strength + dosage form */}
              {(order.productStrength || order.productDosageForm) && (
                <p className="text-[10px] text-gray-500">
                  {[order.productStrength, order.productDosageForm].filter(Boolean).join(' · ')}
                </p>
              )}
              {/* Offer type badge */}
              {order.offerType === 'bonus' && order.bonusQty && (
                <span className="inline-block text-[9px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                  بوانص +{order.bonusQty}
                </span>
              )}
              {order.offerType === 'discount' && order.discountPct && (
                <span className="inline-block text-[9px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                  خصم {order.discountPct}%
                </span>
              )}
              {order.listingType === 'clearance' && (
                <span className="inline-block text-[9px] font-semibold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                  تصفية
                </span>
              )}
              {order.listingType === 'emergency' && (
                <span className="inline-block text-[9px] font-semibold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                  طارئ
                </span>
              )}
              {/* Expiry */}
              {order.listingExpiryDate && (
                <p className="text-[10px] text-gray-400">
                  ينتهي: {new Date(order.listingExpiryDate).toLocaleDateString('ar-EG', { month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
          ) : (
            <span className="font-mono text-[10px] text-gray-400">#{order.listingId.slice(0, 8)}</span>
          )}
        </td>

        {/* Counterparty */}
        <td className="px-4 py-3.5">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <User size={11} className="text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-700 truncate max-w-[120px]">
                {counterparty ?? (isSeller ? 'مشتري' : 'بائع')}
              </p>
              <p className="text-[10px] text-gray-400">{isSeller ? 'مشترٍ' : 'بائع'}</p>
            </div>
          </div>
        </td>

        {/* Qty / Value */}
        <td className="px-4 py-3.5 whitespace-nowrap">
          <p className="text-xs font-semibold text-gray-900 tabular-nums">{totalValue} ج.م</p>
          <p className="text-[10px] text-gray-400">{order.requestedQty} × {Number(order.agreedPrice).toFixed(2)}</p>
        </td>

        {/* Status */}
        <td className="px-4 py-3.5">
          <div className="flex flex-col items-start gap-1">
            <OrderStatusBadge status={order.status} isRTL={isRTL} />
            {order.status === 'accepted' && countdown && !countdown.expired && (
              <span className={clsx('text-[10px] font-mono font-semibold tabular-nums', countdown.urgent ? 'text-red-500' : 'text-amber-500')}>
                ⏱ {countdown.display}
              </span>
            )}
            {order.hasDispute && (
              <span className="text-[9px] font-semibold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                نزاع مفتوح
              </span>
            )}
          </div>
        </td>

        {/* Date */}
        <td className="px-4 py-3.5 whitespace-nowrap">
          <p className="text-xs text-gray-600">
            {new Date(order.createdAt).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' })}
          </p>
          <p className="text-[10px] text-gray-400">
            {new Date(order.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </td>

        {/* Actions */}
        <td className="px-4 py-3.5 text-end" onClick={e => e.stopPropagation()}>
          {hasActions ? (
            <div className="flex items-center justify-end gap-1.5">
              {canAcceptReject && !showReject && !showAcceptForm && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowAcceptForm(true) }}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors"
                  >
                    قبول
                  </button>
                  <button
                    onClick={() => setShowReject(true)}
                    className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors"
                  >
                    رفض
                  </button>
                </>
              )}
              {canAcceptReject && !showReject && showAcceptForm && (
                <div className="flex flex-col items-end gap-1.5" onClick={e => e.stopPropagation()}>
                  <p className="text-[11px] font-semibold text-gray-600">
                    تاريخ التسليم المتوقع <span className="text-gray-400 font-normal">(اختياري)</span>
                  </p>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={acceptDeliveryDate}
                      onChange={e => setAcceptDeliveryDate(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                    <button
                      onClick={() => acceptM.mutate()}
                      disabled={acceptM.isPending}
                      className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {acceptM.isPending ? '...' : 'تأكيد القبول'}
                    </button>
                    <button
                      onClick={() => { setShowAcceptForm(false); setAcceptDeliveryDate('') }}
                      className="w-7 h-7 border border-gray-200 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-50"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              )}
              {canAcceptReject && showReject && (
                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                  <input
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="سبب الرفض..."
                    className="w-36 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-400"
                    dir="rtl"
                    autoFocus
                  />
                  <button
                    onClick={() => rejectM.mutate()}
                    disabled={!rejectReason || rejectM.isPending}
                    className="w-7 h-7 bg-red-600 text-white rounded-lg flex items-center justify-center disabled:opacity-50"
                  >
                    <Check size={12} />
                  </button>
                  <button
                    onClick={() => { setShowReject(false); setRejectReason('') }}
                    className="w-7 h-7 border border-gray-200 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-50"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              {canShip && (
                <button
                  onClick={(e) => { e.stopPropagation(); shipM.mutate() }}
                  disabled={shipM.isPending}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {shipM.isPending ? '...' : '📦 تم الشحن'}
                </button>
              )}
              {canConfirmReceipt && (
                <button
                  onClick={() => completeM.mutate()}
                  disabled={completeM.isPending}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {completeM.isPending ? '...' : 'تأكيد الاستلام'}
                </button>
              )}
              {canCancel && !showReject && !showDisputeForm && (
                <button
                  onClick={() => cancelM.mutate()}
                  disabled={cancelM.isPending}
                  className="px-2 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-xs hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {cancelM.isPending ? '...' : 'إلغاء'}
                </button>
              )}
              {canDispute && !showDisputeForm && (
                <button
                  onClick={() => setShowDisputeForm(true)}
                  className="px-2 py-1.5 border border-orange-200 text-orange-600 rounded-lg text-xs hover:bg-orange-50 transition-colors"
                >
                  مشكلة في الاستلام
                </button>
              )}
              {showDisputeForm && (
                <div className="flex flex-col items-end gap-1.5" onClick={e => e.stopPropagation()}>
                  <select
                    value={disputeType}
                    onChange={e => setDisputeType(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
                    dir="rtl"
                  >
                    <option value="wrong_qty">الكمية ناقصة أو مختلفة</option>
                    <option value="wrong_product">منتج مختلف عن الطلب</option>
                    <option value="damaged">منتج تالف أو مكسور</option>
                    <option value="expired">منتج منتهي الصلاحية</option>
                  </select>
                  <textarea
                    value={disputeDesc}
                    onChange={e => setDisputeDesc(e.target.value)}
                    placeholder="وصف المشكلة بالتفصيل..."
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                    dir="rtl"
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => disputeM.mutate()}
                      disabled={!disputeDesc.trim() || disputeM.isPending}
                      className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-semibold hover:bg-orange-700 disabled:opacity-50"
                    >
                      {disputeM.isPending ? '...' : 'إرسال البلاغ'}
                    </button>
                    <button
                      onClick={() => { setShowDisputeForm(false); setDisputeDesc('') }}
                      className="w-7 h-7 border border-gray-200 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-50"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-gray-400">—</span>
          )}
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr className="bg-white border-b border-gray-100">
          <td colSpan={7} className="px-5 py-4">
            {/* ── ORDER TIMELINE ───────────────────────────────────────────── */}
            {(() => {
              type NodeState = 'done' | 'active' | 'problem' | 'future' | 'rejected' | 'cancelled'
              const hrsSince = (ts?: string | null) =>
                ts ? (Date.now() - new Date(ts).getTime()) / 3_600_000 : 0
              const fmtTs = (ts?: string | null) =>
                ts ? new Date(ts).toLocaleString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null

              const s = order.status
              const urgency = order.urgencyLevel ?? 'normal'

              const step1: NodeState = 'done'
              const step2: NodeState =
                s === 'rejected' ? 'rejected' :
                (s === 'cancelled' && !order.respondedAt) ? 'cancelled' :
                (s === 'pending' && hrsSince(order.createdAt) >= 2) ? 'problem' :
                s === 'pending' ? 'active' : 'done'
              const step3: NodeState =
                ['pending', 'rejected'].includes(s) ? 'future' :
                (s === 'cancelled' && !order.shippedAt) ? 'cancelled' :
                ['shipped', 'completed'].includes(s) ? 'done' :
                (s === 'accepted' && (urgency === 'normal' ? hrsSince(order.respondedAt) >= 4 : hrsSince(order.respondedAt) >= 1)) ? 'problem' :
                'active'
              const step4: NodeState =
                !['shipped', 'completed'].includes(s) ? 'future' :
                s === 'completed' ? 'done' :
                hrsSince(order.shippedAt) >= 72 ? 'problem' :
                'active'

              type StepDef = { label: string; state: NodeState; ts: string | null; sub?: string; tag?: React.ReactNode }
              const steps: StepDef[] = [
                { label: 'طُلب',   state: step1, ts: fmtTs(order.createdAt) },
                {
                  label: s === 'rejected' ? 'رُفض' : 'قُبل',
                  state: step2, ts: fmtTs(order.respondedAt),
                  sub: step2 === 'problem' ? `${Math.floor(hrsSince(order.createdAt))}س بدون رد`
                     : step2 === 'active'  ? 'بانتظار الرد' : undefined,
                  tag: urgency !== 'normal'
                    ? <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full font-bold',
                        urgency === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                        {urgency === 'critical' ? '🚨 حرج' : '⚡ عاجل'}
                      </span>
                    : undefined,
                },
                {
                  label: 'شُحن',  state: step3, ts: fmtTs(order.shippedAt),
                  sub: step3 === 'problem' ? `${Math.floor(hrsSince(order.respondedAt))}س منذ القبول`
                     : step3 === 'active'  ? 'بانتظار الشحن' : undefined,
                },
                {
                  label: 'استُلم', state: step4, ts: fmtTs(order.completedAt),
                  sub: step4 === 'problem' ? `${Math.floor(hrsSince(order.shippedAt) / 24)} يوم منذ الشحن`
                     : step4 === 'active' && order.expectedDeliveryAt
                       ? `متوقع ${new Date(order.expectedDeliveryAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}`
                     : step4 === 'active' ? 'في الطريق' : undefined,
                  tag: order.hasDispute
                    ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-bold">⚠️ نزاع</span>
                    : undefined,
                },
              ]

              const nodeRing: Record<NodeState, string> = {
                done:      'w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm',
                active:    'w-9 h-9 rounded-full bg-white border-2 border-emerald-400 flex items-center justify-center ring-4 ring-emerald-100 animate-pulse',
                problem:   'w-9 h-9 rounded-full bg-red-500 flex items-center justify-center shadow-sm ring-4 ring-red-100 animate-pulse',
                future:    'w-9 h-9 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center',
                rejected:  'w-9 h-9 rounded-full bg-red-100 border-2 border-red-300 flex items-center justify-center',
                cancelled: 'w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center',
              }
              const labelColor: Record<NodeState, string> = {
                done: 'text-emerald-700', active: 'text-emerald-600', problem: 'text-red-600',
                future: 'text-gray-400', rejected: 'text-red-500', cancelled: 'text-gray-400',
              }
              const lineColor = (from: NodeState, to: NodeState) =>
                from === 'done' && to === 'done'     ? 'bg-emerald-400' :
                from === 'done' && to === 'active'   ? 'bg-gradient-to-l from-emerald-400 to-emerald-100' :
                from === 'done' && to === 'problem'  ? 'bg-gradient-to-l from-emerald-400 to-red-300' :
                'bg-gray-200'
              const getIcon = (st: NodeState) => {
                if (st === 'done')      return <Check size={16} className="text-white" strokeWidth={2.5} />
                if (st === 'active')    return <Clock size={14} className="text-emerald-500" />
                if (st === 'problem')   return <AlertTriangle size={14} className="text-white" />
                if (st === 'rejected')  return <X size={14} className="text-red-500" />
                if (st === 'cancelled') return <X size={14} className="text-gray-400" />
                return <div className="w-2 h-2 rounded-full bg-gray-300" />
              }

              const hasAnyProblem = [step2, step3, step4].some(st => st === 'problem')

              return (
                <div className="mb-4">
                  <div className="overflow-x-auto pb-1" dir="rtl">
                    <div className="min-w-[340px] flex items-start gap-0 px-2 pt-1">
                      {steps.map((step, i) => (
                        <React.Fragment key={step.label}>
                          {i > 0 && (
                            <div className={clsx('flex-1 h-0.5 mt-[18px]', lineColor(steps[i - 1].state, step.state))} />
                          )}
                          <div className="flex flex-col items-center gap-0.5 shrink-0 w-[72px]">
                            <div className={nodeRing[step.state]}>{getIcon(step.state)}</div>
                            <span className={clsx('text-[11px] font-semibold text-center leading-tight mt-1', labelColor[step.state])}>
                              {step.label}
                            </span>
                            {step.ts && (
                              <span className="text-[9px] text-gray-400 text-center leading-tight whitespace-nowrap">{step.ts}</span>
                            )}
                            {step.sub && (
                              <span className={clsx(
                                'text-[9px] text-center leading-tight px-1.5 py-0.5 rounded-full mt-0.5',
                                step.state === 'problem' ? 'bg-red-50 text-red-600' :
                                step.state === 'active'  ? 'bg-emerald-50 text-emerald-600' : 'text-gray-400',
                              )}>
                                {step.sub}
                              </span>
                            )}
                            {step.tag && <div className="mt-0.5">{step.tag}</div>}
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  {/* AI monitoring alert */}
                  {hasAnyProblem && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-lg text-[11px] text-amber-700">
                      <Sparkles size={11} className="shrink-0" />
                      الذكاء الاصطناعي يراقب هذا الطلب — تحقق من مهام مركز الذكاء
                    </div>
                  )}

                  {/* Countdown for accepted */}
                  {order.status === 'accepted' && countdown && (
                    <div className={clsx(
                      'mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px]',
                      countdown.expired ? 'bg-red-50 text-red-700' : countdown.urgent ? 'bg-orange-50 text-orange-700' : 'bg-amber-50 text-amber-700',
                    )}>
                      <Clock size={11} className="animate-pulse" />
                      {countdown.expired ? 'انتهت مهلة التسليم' : `نافذة التسليم: ${countdown.display}`}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* ── DETAIL FIELDS ────────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-3 text-xs text-gray-600 pt-3 border-t border-gray-100" dir="rtl">
              <div>
                <span className="text-gray-400">رقم الطلب: </span>
                <span className="font-mono text-gray-500">{order.id.slice(0, 8)}…</span>
              </div>
              <div>
                <span className="text-gray-400">السعر المتفق: </span>
                <span className="font-semibold text-gray-800">{Number(order.agreedPrice).toFixed(2)} ج.م</span>
              </div>
              {order.productStrength && (
                <div>
                  <span className="text-gray-400">التركيز: </span>
                  <span>{order.productStrength}</span>
                </div>
              )}
              {order.notes && (
                <div className="w-full">
                  <span className="text-gray-400">ملاحظات: </span>
                  <span>{order.notes}</span>
                </div>
              )}
              {order.rejectionReason && (
                <div className="w-full px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-red-600">
                  <span className="font-medium">سبب الرفض: </span>{order.rejectionReason}
                </div>
              )}
              {order.deliveryNote && (
                <div className="w-full px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-700">
                  <span className="font-medium">بيانات التوصيل: </span>{order.deliveryNote}
                </div>
              )}
              {order.status === 'completed' && (
                <button
                  onClick={() => p2pOrdersApi.getTransferRecord(order.id).then(blob => {
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'
                    document.body.appendChild(a); a.click(); document.body.removeChild(a)
                    setTimeout(() => URL.revokeObjectURL(url), 60000)
                  })}
                  className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  <Receipt size={12} />
                  📄 سند النقل
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── QUICK START GUIDE ─────────────────────────────────────────────────────────

function QuickStartGuide({
  isRTL, sellerProfile, onClose, onNavigate, onShowLegal,
}: { isRTL: boolean; sellerProfile?: SellerProfile | null; onClose: () => void; onNavigate: (tab: string) => void; onShowLegal: () => void }) {
  const [view, setView] = useState<'welcome' | 'setup'>('welcome')

  const hasProfile    = !!sellerProfile
  const hasLegal      = !!sellerProfile?.lastLegalAckAt
  const hasLocation   = !!(sellerProfile?.city || sellerProfile?.gpsLocation)
  const hasRequiredDocs = !!(sellerProfile?.pharmacyLicenseUrl && sellerProfile?.commercialRegUrl)
  const hasZones      = (sellerProfile?.deliveryZones?.length ?? 0) > 0
  const isVerified    = sellerProfile?.verificationStatus === 'verified'

  const steps = [
    { done: true,                      icon: User,         labelAr: 'تسجيل الحساب',                          time: '',             ctaAr: '',               tab: '',        legal: false, accent: 'from-emerald-500 to-violet-500' },
    { done: hasLegal,                  icon: Shield,       labelAr: 'الإقرار القانوني (كل 90 يوم)',           time: '٢ دقيقة',      ctaAr: 'أتمّ الإقرار',   tab: 'sell',   legal: true,  accent: 'from-blue-500 to-indigo-500'  },
    { done: hasProfile && hasLocation, icon: MapPin,       labelAr: 'ملف البائع — الاسم والموقع',             time: '٣ دقائق',      ctaAr: 'أكمل ملفك',      tab: 'profile',legal: false, accent: 'from-violet-500 to-purple-500' },
    { done: hasRequiredDocs,           icon: FileText,     labelAr: 'المستندات الرسمية',                      time: '٢ دقيقة',      ctaAr: 'ارفع المستندات', tab: 'profile',legal: false, accent: 'from-amber-500 to-orange-500'  },
    { done: hasZones,                  icon: Truck,        labelAr: 'مناطق التوصيل',                          time: '٢ دقيقة',      ctaAr: 'أضف المناطق',    tab: 'profile',legal: false, accent: 'from-sky-500 to-cyan-500'      },
    { done: isVerified,                icon: Award,        labelAr: 'شارة موثق ★',                            time: 'بعد المراجعة', ctaAr: '',               tab: '',        legal: false, accent: 'from-yellow-400 to-amber-500'  },
  ]

  const completedCount = steps.filter(s => s.done).length
  const pct = Math.round((completedCount / steps.length) * 100)
  const nextStep = steps.find(s => !s.done)

  const sellerBenefits = [
    { icon: TrendingUp,  titleAr: 'ربح 20-40% من الفائض',        descAr: 'حوّل المخزون الزائد إلى أرباح حقيقية بدل أن يتلف' },
    { icon: DollarSign,  titleAr: 'تصفية المنتهي قبل انتهائه',   descAr: 'بع قبل 3-6 أشهر من الانتهاء بأسعار تنافسية' },
    { icon: Shield,      titleAr: 'مدفوعات آمنة ومضمونة',        descAr: 'مبلغك محفوظ مسبقاً قبل شحن أي طلب' },
    { icon: Award,       titleAr: 'شارة موثق → 3× ظهور أكثر',   descAr: 'أولوية في نتائج البحث ومصداقية مرتفعة' },
  ]
  const buyerBenefits = [
    { icon: TrendingDown, titleAr: 'وفّر 20-40% على المشتريات',  descAr: 'أسعار أقل من الموردين بفضل التداول المباشر' },
    { icon: Truck,        titleAr: 'توصيل خلال ساعات',           descAr: 'صيدليات في نطاق 5-10 كم تشحن بسرعة فائقة' },
    { icon: Star,         titleAr: 'بائعون موثقون رسمياً',        descAr: 'جميع البائعين يحملون تراخيص وسجلات رسمية' },
    { icon: Sparkles,     titleAr: 'ذكاء اصطناعي يكتشف الفرص',  descAr: 'نظامنا يقترح أفضل الصفقات قبل أن تبحث' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[460px] mx-4 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">

        {/* ═══════════════════════════════════ VIEW: WELCOME ═══════════════════ */}
        {view === 'welcome' && (
          <>
            {/* Hero gradient */}
            <div className="relative bg-gradient-to-br from-emerald-600 via-emerald-700 to-violet-800 px-6 pt-6 pb-8 shrink-0 overflow-hidden">
              {/* Decorative blobs */}
              <div className="absolute -top-8 -end-8 w-40 h-40 rounded-full bg-white/5 pointer-events-none" />
              <div className="absolute -bottom-12 -start-12 w-48 h-48 rounded-full bg-violet-900/30 pointer-events-none" />

              <div className="relative flex items-start justify-between mb-5">
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors shrink-0">
                  <X size={15} />
                </button>
                {/* P2P badge */}
                <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/25 flex flex-col items-center justify-center shrink-0">
                  <span className="text-white font-black text-[11px] leading-none tracking-wider">P2P</span>
                  <div className="flex items-center gap-0.5 mt-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                    <ArrowRight size={8} className="text-white/60" />
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-300" />
                  </div>
                </div>
              </div>

              <div className="relative text-center">
                <h2 className="text-white font-black text-xl leading-snug mb-1.5">شبكة البيع بين الصيدليات</h2>
                <p className="text-emerald-200 text-[13px] leading-relaxed mb-5">
                  تبادل الأدوية بين الصيدليات واكتشف الفرص بذكاء وأمان
                </p>

                {/* Network stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { val: '+٣٠٠٠', label: 'صيدلية' },
                    { val: '+٥٠ك', label: 'صفقة/شهر' },
                    { val: '٤.٩★', label: 'تقييم متوسط' },
                  ].map(s => (
                    <div key={s.val} className="bg-white/10 border border-white/20 rounded-xl py-2 px-1">
                      <p className="text-white font-black text-base leading-none">{s.val}</p>
                      <p className="text-emerald-200 text-[10px] mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Wave divider */}
            <div className="relative h-5 shrink-0 bg-white overflow-hidden">
              <svg viewBox="0 0 460 20" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                <path d="M0,0 C115,20 345,0 460,20 L460,0 Z" fill="#065f46" />
              </svg>
            </div>

            {/* Benefits grid — scrollable */}
            <div className="overflow-y-auto flex-1 px-4 pb-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Seller column */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                      <TrendingUp size={11} className="text-emerald-600" />
                    </div>
                    <span className="text-xs font-bold text-emerald-700">بائع</span>
                  </div>
                  {sellerBenefits.map((b, i) => {
                    const Icon = b.icon
                    return (
                      <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/40 transition-all">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-violet-600 flex items-center justify-center mb-2">
                          <Icon size={14} className="text-white" />
                        </div>
                        <p className="text-[12px] font-bold text-gray-800 leading-snug">{b.titleAr}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{b.descAr}</p>
                      </div>
                    )
                  })}
                </div>

                {/* Buyer column */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                      <TrendingDown size={11} className="text-blue-600" />
                    </div>
                    <span className="text-xs font-bold text-blue-700">مشتري</span>
                  </div>
                  {buyerBenefits.map((b, i) => {
                    const Icon = b.icon
                    return (
                      <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-100 hover:border-blue-200 hover:bg-blue-50/40 transition-all">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-2">
                          <Icon size={14} className="text-white" />
                        </div>
                        <p className="text-[12px] font-bold text-gray-800 leading-snug">{b.titleAr}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{b.descAr}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Footer CTAs */}
            <div className="px-4 pb-4 pt-3 shrink-0 space-y-2 border-t border-gray-100">
              <button
                onClick={() => setView('setup')}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-emerald-600 to-violet-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-200 hover:shadow-emerald-300 hover:from-emerald-700 hover:to-violet-700 transition-all"
              >
                <Plus size={16} />
                ابدأ البيع الآن — نزّل منتجاتك
              </button>
              <button
                onClick={() => { onClose(); onNavigate('buy') }}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-gray-200 text-gray-600 rounded-2xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                اكتشف السوق أولاً
                <ChevronLeft size={14} className={isRTL ? '' : 'rotate-180'} />
              </button>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════ VIEW: SETUP ═════════════════════ */}
        {view === 'setup' && (
          <>
            {/* Header */}
            <div className="relative bg-gradient-to-br from-emerald-600 via-emerald-700 to-violet-800 px-5 pt-5 pb-6 shrink-0 overflow-hidden">
              <div className="absolute -top-6 -end-6 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />

              <div className="relative flex items-center gap-3 mb-4">
                <button onClick={() => setView('welcome')} className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors">
                  <ChevronRight size={15} className={isRTL ? '' : 'rotate-180'} />
                </button>
                <div className="flex-1">
                  <h2 className="text-white font-bold text-base leading-tight">
                    {pct === 100 ? '🎉 حسابك جاهز بالكامل!' : 'أكمل إعداد حساب البائع'}
                  </h2>
                  <p className="text-emerald-200 text-[11px] mt-0.5">
                    {pct === 100 ? 'أنت جاهز للبيع في الشبكة' : `${completedCount} من ${steps.length} خطوات مكتملة`}
                  </p>
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors shrink-0">
                  <X size={15} />
                </button>
              </div>

              {/* Progress bar */}
              <div className="relative h-2.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-emerald-200 text-[10px]">{pct}% مكتمل</span>
                {nextStep && <span className="text-emerald-300 text-[10px]">التالي: {nextStep.labelAr}</span>}
              </div>
            </div>

            {/* Steps — scrollable journey */}
            <div className="overflow-y-auto flex-1 px-4 py-3">
              <div className="space-y-0">
                {steps.map((step, i) => {
                  const Icon = step.icon
                  const isNext = !step.done && (i === 0 || steps[i - 1].done)
                  const isLast = i === steps.length - 1
                  return (
                    <div key={i} className="flex gap-3">
                      {/* Timeline line + node */}
                      <div className="flex flex-col items-center shrink-0">
                        <div className={clsx(
                          'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all',
                          step.done
                            ? 'bg-gradient-to-br from-emerald-500 to-violet-600 shadow-sm shadow-emerald-200'
                            : isNext
                            ? `bg-gradient-to-br ${step.accent} shadow-md animate-pulse`
                            : 'bg-gray-100',
                        )}>
                          {step.done
                            ? <Check size={15} className="text-white" strokeWidth={2.5} />
                            : <Icon size={14} className={isNext ? 'text-white' : 'text-gray-400'} />}
                        </div>
                        {!isLast && (
                          <div className={clsx('w-0.5 flex-1 my-1 min-h-[18px]', step.done ? 'bg-emerald-300' : 'bg-gray-200')} />
                        )}
                      </div>

                      {/* Content */}
                      <div className={clsx(
                        'flex-1 pb-3 flex items-start justify-between gap-2',
                        isLast && 'pb-1',
                      )}>
                        <div className="min-w-0">
                          <p className={clsx(
                            'text-sm font-semibold leading-tight',
                            step.done ? 'text-gray-400 line-through' : isNext ? 'text-gray-900' : 'text-gray-500',
                          )}>
                            {step.labelAr}
                          </p>
                          {!step.done && step.time && (
                            <p className={clsx('text-[11px] mt-0.5', isNext ? 'text-emerald-600 font-medium' : 'text-gray-400')}>
                              <Clock size={9} className="inline me-0.5" />{step.time}
                            </p>
                          )}
                          {step.done && (
                            <p className="text-[11px] text-emerald-500 mt-0.5 font-medium">✓ مكتمل</p>
                          )}
                        </div>
                        {!step.done && step.ctaAr && (
                          <button
                            onClick={() => step.legal ? onShowLegal() : onNavigate(step.tab)}
                            className={clsx(
                              'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-colors',
                              isNext
                                ? 'bg-violet-700 text-white hover:bg-violet-800 shadow-sm'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                            )}
                          >
                            {step.ctaAr}
                            <ArrowRight size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 pb-4 pt-2 shrink-0 space-y-2 border-t border-gray-100">
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100">
                <Award size={14} className="shrink-0 mt-0.5 text-amber-500" />
                <p className="text-[11px] text-amber-700 leading-snug">
                  الصيدليات الموثقة تحصل على <span className="font-bold">3× مشاهدات أكثر</span> وأولوية في نتائج البحث
                </p>
              </div>
              {pct === 100 && (
                <button
                  onClick={() => { onClose(); onNavigate('sell') }}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-emerald-600 to-violet-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-200 hover:shadow-emerald-300 transition-all"
                >
                  <Rocket size={15} />
                  ابدأ نزيل منتجاتك الآن
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── PROFILE TAB — full settings (Aumet-style + extras) ───────────────────────

const DOC_TYPES: Array<{
  key: keyof import('../../types/p2p').SellerProfile
  docType: string
  labelAr: string
  labelEn: string
  descAr: string
  descEn: string
  required: boolean
}> = [
  {
    key: 'pharmacyLicenseUrl',
    docType: 'pharmacy_license',
    labelAr: 'ترخيص الصيدلية',
    labelEn: 'Pharmacy License',
    descAr: 'الترخيص الصادر من وزارة الصحة — يثبت حق مزاولة النشاط الصيدلاني',
    descEn: 'Ministry of Health license to operate the pharmacy',
    required: true,
  },
  {
    key: 'commercialRegUrl',
    docType: 'commercial_reg',
    labelAr: 'السجل التجاري',
    labelEn: 'Commercial Register',
    descAr: 'وثيقة التسجيل التجاري الرسمية (مصر: وزارة التجارة — الخليج: سجل تجاري)',
    descEn: 'Official commercial registration document',
    required: true,
  },
  {
    key: 'taxDocUrl',
    docType: 'tax_doc',
    labelAr: 'البطاقة الضريبية / شهادة التسجيل',
    labelEn: 'Tax Card / Registration',
    descAr: 'الرقم الضريبي أو شهادة التسجيل في مصلحة الضرائب',
    descEn: 'Tax ID number or tax authority registration certificate',
    required: true,
  },
  {
    key: 'pharmacistLicenseUrl',
    docType: 'pharmacist_license',
    labelAr: 'بطاقة نقابة الصيادلة / الترخيص المهني',
    labelEn: 'Pharmacist Professional License',
    descAr: 'مصر: بطاقة نقابة الصيادلة — الخليج: ترخيص SCFHS / DHA / MOH',
    descEn: 'Egypt: syndicate card — GCC: SCFHS / DHA / MOH professional license',
    required: true,
  },
  {
    key: 'licenseHolderIdUrl',
    docType: 'license_holder_id',
    labelAr: 'هوية مالك الترخيص',
    labelEn: 'License Holder ID',
    descAr: 'البطاقة الوطنية أو جواز السفر لمالك الترخيص',
    descEn: 'National ID or passport of the pharmacy license holder',
    required: true,
  },
  {
    key: 'municipalPermitUrl',
    docType: 'municipal_permit',
    labelAr: 'رخصة البلدية (دول الخليج)',
    labelEn: 'Municipal Permit (GCC)',
    descAr: 'مطلوب في السعودية والإمارات والكويت — رخصة النشاط التجاري من البلدية',
    descEn: 'Required in KSA, UAE & Kuwait — municipal commercial activity permit',
    required: false,
  },
  {
    key: 'vatCertUrl',
    docType: 'vat_cert',
    labelAr: 'شهادة ضريبة القيمة المضافة',
    labelEn: 'VAT Registration Certificate',
    descAr: 'مطلوب للشركات المسجلة ضريبياً في السعودية والإمارات',
    descEn: 'Required for VAT-registered businesses in KSA & UAE',
    required: false,
  },
]

function parseGoogleMapsUrl(input: string): string {
  const atMatch = input.match(/@(-?\d+\.?\d+),(-?\d+\.?\d+)/)
  if (atMatch) return `${atMatch[1]},${atMatch[2]}`
  const qMatch = input.match(/[?&]q=(-?\d+\.?\d+),(-?\d+\.?\d+)/)
  if (qMatch) return `${qMatch[1]},${qMatch[2]}`
  const direct = input.trim().match(/^(-?\d+\.?\d+),\s*(-?\d+\.?\d+)$/)
  if (direct) return `${direct[1]},${direct[2]}`
  return input
}

interface ZoneUI { radiusKm: 3 | 5 | 10; price: number; isFree: boolean; isEnabled: boolean }

function SettingToggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={clsx(
          'relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5',
          value ? 'bg-emerald-500' : 'bg-gray-200',
        )}
      >
        <span className={clsx(
          'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all',
          value ? 'start-5' : 'start-0.5',
        )} />
      </button>
    </div>
  )
}

function SectionCard({ titleAr, titleEn, icon: Icon, isRTL, children }: {
  titleAr: string; titleEn: string; icon: React.ElementType; isRTL: boolean; children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50/60">
        <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
          <Icon size={16} className="text-emerald-600" />
        </div>
        <h3 className="font-semibold text-gray-800 text-sm">{isRTL ? titleAr : titleEn}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function ProfileTab({ isRTL, sellerProfile, onShowLegalAck, apiRef }: {
  isRTL: boolean
  sellerProfile?: SellerProfile | null
  onShowLegalAck?: () => void
  apiRef?: React.MutableRefObject<{ goToStep: (n: number) => void } | null>
}) {
  const qc = useQueryClient()
  const { currency } = useCurrency()
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (apiRef) apiRef.current = { goToStep: setStep }
    return () => { if (apiRef) apiRef.current = null }
  }, [apiRef])
  const [gpsWarning, setGpsWarning] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const [docProgress, setDocProgress] = useState<Record<string, number>>({})
  const [resetAckPending, setResetAckPending] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function uploadDoc(docType: string, file: File) {
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError(isRTL
        ? 'صيغة غير مدعومة. الصيغ المسموح بها: PDF، JPG، PNG، WEBP'
        : 'Unsupported format. Allowed: PDF, JPG, PNG, WEBP')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError(isRTL ? 'حجم الملف يتجاوز 10 ميجابايت' : 'File exceeds the 10 MB limit')
      return
    }
    setUploadingDoc(docType)
    setUploadError(null)
    setDocProgress(p => ({ ...p, [docType]: 0 }))
    try {
      await p2pSellerApi.uploadDoc(docType, file, pct =>
        setDocProgress(p => ({ ...p, [docType]: pct }))
      )
      await qc.invalidateQueries({ queryKey: ['p2p-seller-profile'] })
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Upload failed'
      setUploadError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setUploadingDoc(null)
      setDocProgress(p => { const n = { ...p }; delete n[docType]; return n })
    }
  }

  async function handleResetLegalAck() {
    setResetAckPending(true)
    try {
      await p2pSellerApi.resetLegalAck()
      await qc.invalidateQueries({ queryKey: ['p2p-seller-profile'] })
      onShowLegalAck?.()
    } finally {
      setResetAckPending(false)
    }
  }

  function buildFormFromProfile(p: SellerProfile | null | undefined) {
    return {
      legalName:   p?.legalName   ?? '',
      country:     p?.country     ?? '',
      city:        p?.city        ?? '',
      region:      p?.region      ?? '',
      address:     p?.address     ?? '',
      gpsLocation: p?.gpsLocation ?? '',
      isVisible:   p?.isVisible   ?? true,
      deliveryZones: ([3, 5, 10] as const).map(r => {
        const ex = p?.deliveryZones?.find(z => z.radiusKm === r)
        return { radiusKm: r, price: ex?.price ?? 0, isFree: ex?.isFree ?? (r === 3), isEnabled: !!ex } as ZoneUI
      }),
      automations: {
        autoListNearExpiry:  p?.automations?.autoListNearExpiry  ?? false,
        autoUpdateDiscounts: p?.automations?.autoUpdateDiscounts ?? false,
        autoDownloadInvoice: p?.automations?.autoDownloadInvoice ?? true,
        autoProcurement:     p?.automations?.autoProcurement     ?? true,
      },
      notificationPrefs: {
        newOrders:         p?.notificationPrefs?.newOrders         ?? true,
        orderActivity:     p?.notificationPrefs?.orderActivity     ?? true,
        autoListings:      p?.notificationPrefs?.autoListings      ?? false,
        priceAlerts:       p?.notificationPrefs?.priceAlerts       ?? false,
        expiryWarnings:    p?.notificationPrefs?.expiryWarnings    ?? true,
        aiRecommendations: p?.notificationPrefs?.aiRecommendations ?? true,
      },
    }
  }

  const [form, setForm] = useState(() => buildFormFromProfile(sellerProfile))

  // Sync form when profile data arrives after initial mount (query loading race)
  useEffect(() => {
    if (sellerProfile) setForm(buildFormFromProfile(sellerProfile))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerProfile?.id])
  const [mapsInput, setMapsInput] = useState('')

  const upsertMutation = useMutation({
    mutationFn: () => p2pSellerApi.upsertProfile({
      ...form,
      deliveryZones: form.deliveryZones
        .filter(z => z.isEnabled)
        .map(({ radiusKm, price, isFree }) => ({ radiusKm, price, isFree })),
    } as Partial<SellerProfile>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['p2p-seller-profile'] })
      setStep(prev => Math.min(prev + 1, 5))
    },
  })

  const LABEL = 'block text-xs font-semibold text-gray-600 mb-1.5'

  function handleMapsInput(val: string) {
    setMapsInput(val)
    const parsed = parseGoogleMapsUrl(val)
    if (parsed !== val) setForm(f => ({ ...f, gpsLocation: parsed }))
  }
  function setAuto(key: keyof typeof form.automations, val: boolean) {
    setForm(f => ({ ...f, automations: { ...f.automations, [key]: val } }))
  }
  function setNotif(key: keyof typeof form.notificationPrefs, val: boolean) {
    setForm(f => ({ ...f, notificationPrefs: { ...f.notificationPrefs, [key]: val } }))
  }
  function setZone(i: number, patch: Partial<ZoneUI>) {
    setForm(f => { const z = [...f.deliveryZones]; z[i] = { ...z[i], ...patch }; return { ...f, deliveryZones: z } })
  }

  const uploadedDocsCount = DOC_TYPES.filter(d => !!sellerProfile?.[d.key]).length

  const stepDefs = [
    { titleAr: 'المعلومات العامة',    titleEn: 'General Info',     summaryFn: () => form.legalName || '—',                                               icon: FileText },
    { titleAr: 'الموقع والعنوان',     titleEn: 'Location',         summaryFn: () => [form.city, form.country].filter(Boolean).join(', ') || '—',          icon: MapPin },
    { titleAr: 'المستندات الرسمية',   titleEn: 'Official Docs',    summaryFn: () => `${uploadedDocsCount}/${DOC_TYPES.length}`,                           icon: Shield },
    { titleAr: 'مناطق التوصيل',       titleEn: 'Delivery Zones',   summaryFn: () => `${form.deliveryZones.filter(z => z.isEnabled).length} منطقة`,        icon: Truck },
    { titleAr: 'الأتمتة والإشعارات', titleEn: 'Automation',       summaryFn: () => Object.values(form.automations).filter(Boolean).length + ' مُفعّل',   icon: Zap },
    { titleAr: 'الظهور والحفظ',       titleEn: 'Visibility & Save', summaryFn: () => form.isVisible ? (isRTL ? 'ظاهر' : 'Visible') : (isRTL ? 'مخفي' : 'Hidden'), icon: Eye },
  ]

  const zoneLabels = isRTL
    ? [{ label: 'قريب (3 كم)', desc: 'توصيل ضمن 3 كم' }, { label: 'متوسط (5 كم)', desc: 'توصيل ضمن 5 كم' }, { label: 'بعيد (10 كم)', desc: 'توصيل ضمن 10 كم' }]
    : [{ label: 'Near (3 km)', desc: 'Within 3 km' }, { label: 'Medium (5 km)', desc: 'Within 5 km' }, { label: 'Far (10 km)', desc: 'Within 10 km' }]

  return (
    <div className="space-y-6">

      {/* ── Verification banner + legal ack reset ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {sellerProfile?.legalName ? (
          <div className={clsx(
            'flex items-center gap-3 p-3.5 rounded-2xl border text-sm font-medium flex-1',
            sellerProfile.verificationStatus === 'verified'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : sellerProfile.verificationStatus === 'rejected'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-amber-50 border-amber-200 text-amber-700',
          )}>
            {sellerProfile.verificationStatus === 'verified'
              ? <CheckCircle2 size={16} className="shrink-0" />
              : <AlertCircle size={16} className="shrink-0" />}
            <span>
              {sellerProfile.verificationStatus === 'verified'
                ? (isRTL ? 'حسابك موثق ✓ — إعلاناتك ظاهرة في السوق' : 'Account verified ✓ — your listings are visible')
                : sellerProfile.verificationStatus === 'rejected'
                  ? (isRTL ? `مرفوض: ${sellerProfile.rejectionReason}` : `Rejected: ${sellerProfile.rejectionReason}`)
                  : (isRTL ? 'في انتظار مراجعة الإدارة — سنُبلّغك عند الموافقة' : 'Pending admin review — we\'ll notify you on approval')}
            </span>
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <button
          onClick={handleResetLegalAck}
          disabled={resetAckPending}
          className="flex items-center gap-1.5 px-3.5 py-2 border border-gray-200 rounded-xl text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50 shrink-0"
          title={isRTL ? 'إعادة قراءة إقرار الالتزام القانوني' : 'Re-read the legal compliance declaration'}
        >
          <FileText size={12} />
          {resetAckPending
            ? (isRTL ? 'جارٍ...' : 'Loading...')
            : (isRTL ? 'إعادة قراءة الإقرار' : 'Re-read Declaration')}
        </button>
      </div>

      {/* ── Horizontal stepper ── */}
      <div className="w-full bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">

        {/* Step nodes + connectors */}
        <div className="flex items-start w-full">
          {stepDefs.map((s, i) => {
            const isActive = step === i
            const isDone   = i < step
            const isLast   = i === stepDefs.length - 1
            const Icon     = s.icon
            return (
              <React.Fragment key={i}>
                <button
                  onClick={() => setStep(i)}
                  className="flex flex-col items-center gap-2 group min-w-0"
                  style={{ flex: '0 0 auto', width: '5.5rem' }}
                >
                  <div className={clsx(
                    'w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all',
                    isActive
                      ? 'border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-200 scale-110'
                      : isDone
                        ? 'border-emerald-400 bg-emerald-400 text-white'
                        : 'border-dashed border-gray-300 bg-gray-50 text-gray-400 group-hover:border-gray-400',
                  )}>
                    {isDone ? <Check size={16} strokeWidth={2.5} /> : <Icon size={16} />}
                  </div>
                  <div className="text-center">
                    <p className={clsx(
                      'text-[11px] font-semibold leading-tight',
                      isActive ? 'text-emerald-700' : isDone ? 'text-gray-700' : 'text-gray-400',
                    )}>
                      {isRTL ? s.titleAr : s.titleEn}
                    </p>
                    {isDone && (
                      <p className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[5rem]">{s.summaryFn()}</p>
                    )}
                    {!isDone && !isActive && (
                      <p className="text-[10px] text-gray-300 mt-0.5">{isRTL ? 'لم يكتمل' : 'Pending'}</p>
                    )}
                  </div>
                </button>
                {!isLast && (
                  <div className="flex-1 h-0.5 mt-5 mx-1 rounded-full transition-colors"
                    style={{ background: isDone ? '#6ee7b7' : '#e5e7eb' }} />
                )}
              </React.Fragment>
            )
          })}
        </div>

        <p className="text-xs text-gray-400 mt-4 text-center">
          {isRTL ? `الخطوة ${step + 1} من ${stepDefs.length}` : `Step ${step + 1} of ${stepDefs.length}`}
          {step === 5 && upsertMutation.isSuccess && (
            <span className="text-emerald-600 font-semibold ms-2">{isRTL ? '— تم الحفظ ✓' : '— Saved ✓'}</span>
          )}
        </p>

        <div className="border-t border-gray-100 my-5" />

        {/* ── Step title ── */}
        <div className="mb-5">
          <p className="text-sm font-bold text-gray-900">{isRTL ? stepDefs[step].titleAr : stepDefs[step].titleEn}</p>
        </div>

        {/* ── Step 0: General Info ── */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={LABEL}>{isRTL ? 'الاسم القانوني للصيدلية *' : 'Legal pharmacy name *'}</label>
                <input id="p2p-profile-name" value={form.legalName} onChange={e => setForm(f => ({ ...f, legalName: e.target.value }))}
                  placeholder={isRTL ? 'مثال: صيدلية النور' : 'e.g. Al-Noor Pharmacy'} className={INPUT} autoFocus />
                <p className="text-[11px] text-gray-400 mt-1">{isRTL ? 'يجب مطابقة الاسم في الترخيص الصيدلاني' : 'Must match your pharmacy license'}</p>
              </div>
              <div>
                <label className={LABEL}>{isRTL ? 'الدولة' : 'Country'}</label>
                <input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                  placeholder={isRTL ? 'مصر' : 'Egypt'} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>{isRTL ? 'المدينة' : 'City'}</label>
                <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  placeholder={isRTL ? 'القاهرة' : 'Cairo'} className={INPUT} />
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setStep(1)} disabled={!form.legalName.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {isRTL ? 'التالي' : 'Next'} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1: Location ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>{isRTL ? 'المنطقة / الحي' : 'Region / District'}</label>
                <input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                  placeholder={isRTL ? 'حي مصر الجديدة' : 'Heliopolis'} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>{isRTL ? 'إحداثيات GPS' : 'GPS Coordinates'}</label>
                <input id="p2p-profile-gps" value={form.gpsLocation} onChange={e => setForm(f => ({ ...f, gpsLocation: e.target.value }))}
                  placeholder="30.0626,31.2497" className={INPUT} />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>
                  <span className="flex items-center gap-1.5"><Link2 size={12} />{isRTL ? 'الصق رابط Google Maps لاستخراج الإحداثيات تلقائياً' : 'Paste Google Maps link to auto-extract coordinates'}</span>
                </label>
                <input value={mapsInput} onChange={e => handleMapsInput(e.target.value)}
                  placeholder="https://maps.google.com/..." className={INPUT} />
                {mapsInput && form.gpsLocation && (
                  <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                    <Check size={11} strokeWidth={3} />{isRTL ? `إحداثيات: ${form.gpsLocation}` : `Coordinates: ${form.gpsLocation}`}
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>{isRTL ? 'العنوان التفصيلي' : 'Full address'}</label>
                <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  rows={2} className={INPUT} placeholder={isRTL ? 'شارع التحرير، بجوار مسجد...' : 'Tahrir Street, next to...'} />
              </div>
            </div>
            {gpsWarning && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>
                  {isRTL
                    ? 'لم تضف إحداثيات GPS — ستقلّ دقة نتائج البحث القريب. يمكنك الإضافة لاحقاً.'
                    : 'No GPS coordinates — nearby search accuracy will be reduced. You can add them later.'}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <button onClick={() => setStep(0)} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">{isRTL ? 'رجوع' : 'Back'}</button>
              <button
                onClick={() => {
                  if (!form.gpsLocation.trim()) setGpsWarning(true)
                  else setGpsWarning(false)
                  setStep(2)
                }}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700">
                {isRTL ? 'التالي' : 'Next'} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Official Documents ── */}
        {step === 2 && (
          <div id="p2p-docs-section" className="space-y-4">
            {/* Doc progress bar */}
            <div className="flex items-center gap-4 p-3.5 bg-blue-50 rounded-xl border border-blue-200">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                <Shield size={16} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-blue-800">{isRTL ? 'الوثائق المرفوعة' : 'Documents uploaded'}</span>
                  <span className="text-xs font-bold text-blue-700">{uploadedDocsCount} / {DOC_TYPES.length}</span>
                </div>
                <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.round((uploadedDocsCount / DOC_TYPES.length) * 100)}%` }} />
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-500 flex items-start gap-1.5">
              <AlertCircle size={12} className="shrink-0 mt-0.5 text-amber-500" />
              {isRTL
                ? 'رفع المستندات يسرّع التحقق ويمنحك أولوية في نتائج البحث. يمكنك المتابعة والرفع لاحقاً.'
                : 'Uploading documents speeds up verification and boosts your search ranking. You can continue and upload later.'}
            </p>

            <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 font-medium text-gray-500">
                {isRTL ? 'الصيغ المقبولة:' : 'Accepted formats:'}
              </span>
              {['PDF', 'JPG', 'PNG', 'WEBP'].map(f => (
                <span key={f} className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono text-gray-600">{f}</span>
              ))}
              <span className="text-gray-400">{isRTL ? '— حتى 10 ميجا' : '— max 10 MB'}</span>
            </p>

            {/* Re-verification notice — only when already verified */}
            {sellerProfile?.verificationStatus === 'verified' && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>
                  {isRTL
                    ? 'حسابك موثّق حالياً. تغيير أي وثيقة سيُعيد حالتك إلى "قيد المراجعة" حتى تتم مراجعتها من الإدارة.'
                    : 'Your account is currently verified. Replacing any document will reset your status to "pending review" until admin re-approves.'}
                </span>
              </div>
            )}

            {/* Upload error banner */}
            {uploadError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold">{isRTL ? 'فشل الرفع: ' : 'Upload failed: '}</span>
                  {uploadError}
                </div>
                <button onClick={() => setUploadError(null)} className="shrink-0 text-red-400 hover:text-red-600">✕</button>
              </div>
            )}

            {/* Doc rows */}
            <div className="space-y-2">
              {DOC_TYPES.map(doc => {
                const currentUrl = sellerProfile?.[doc.key] as string | undefined
                const isUploading = uploadingDoc === doc.docType
                const pct = docProgress[doc.docType] ?? 0
                return (
                  <div key={doc.key} className={clsx(
                    'rounded-xl border transition-all overflow-hidden',
                    currentUrl ? 'border-emerald-200' : 'border-gray-200',
                  )}>
                    {/* Main row */}
                    <div className={clsx(
                      'flex items-start gap-3 p-3.5',
                      currentUrl ? 'bg-emerald-50/40' : 'bg-white',
                    )}>
                      {/* Status icon */}
                      <div className={clsx(
                        'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                        currentUrl ? 'bg-emerald-100' : 'bg-gray-100',
                      )}>
                        {currentUrl
                          ? <Check size={16} className="text-emerald-600" strokeWidth={2.5} />
                          : <FileText size={16} className="text-gray-400" />}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-800">{isRTL ? doc.labelAr : doc.labelEn}</p>
                          {doc.required
                            ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">{isRTL ? 'مطلوب' : 'Required'}</span>
                            : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold">{isRTL ? 'اختياري' : 'Optional'}</span>}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{isRTL ? doc.descAr : doc.descEn}</p>
                        {currentUrl && (
                          <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                            <Check size={10} strokeWidth={3} />
                            {currentUrl.split('/').pop()} — {isRTL ? 'تم الرفع ✓' : 'Uploaded ✓'}
                          </p>
                        )}
                      </div>

                      {/* Upload button */}
                      <label className={clsx(
                        'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors shrink-0 mt-0.5',
                        isUploading
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : currentUrl
                            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            : 'bg-blue-600 text-white hover:bg-blue-700',
                      )}>
                        {isUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                        {isUploading
                          ? `${pct}%`
                          : currentUrl ? (isRTL ? 'تغيير' : 'Replace') : (isRTL ? 'رفع' : 'Upload')}
                        <input
                          type="file"
                          className="sr-only"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          disabled={isUploading}
                          onChange={e => {
                            const f = e.target.files?.[0]
                            if (f) uploadDoc(doc.docType, f)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    </div>

                    {/* Progress bar — full-width strip at bottom of card */}
                    {isUploading && (
                      <div className="px-3.5 pb-2.5 bg-white">
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-150"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {isRTL ? 'جارٍ الرفع...' : 'Uploading...'} {pct}%
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">{isRTL ? 'رجوع' : 'Back'}</button>
              <button onClick={() => setStep(3)} className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700">
                {isRTL ? 'التالي' : 'Next'} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Delivery Zones ── */}
        {step === 3 && (
          <div id="p2p-delivery-zones" className="space-y-4">
            <div className="space-y-3">
              {form.deliveryZones.map((zone, i) => (
                <div key={zone.radiusKm} className={clsx(
                  'flex items-center gap-3 p-3.5 rounded-xl border transition-all',
                  zone.isEnabled ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 bg-gray-50/40',
                )}>
                  <button onClick={() => setZone(i, { isEnabled: !zone.isEnabled })}
                    className={clsx('relative w-10 h-5 rounded-full transition-colors shrink-0', zone.isEnabled ? 'bg-emerald-500' : 'bg-gray-300')}>
                    <span className={clsx('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all', zone.isEnabled ? 'start-5' : 'start-0.5')} />
                  </button>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <MapPin size={14} className={zone.isEnabled ? 'text-emerald-600' : 'text-gray-400'} />
                    <div>
                      <p className={clsx('text-sm font-semibold', zone.isEnabled ? 'text-gray-800' : 'text-gray-400')}>{zoneLabels[i].label}</p>
                      <p className="text-[11px] text-gray-400">{zoneLabels[i].desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} value={zone.price}
                      onChange={e => setZone(i, { price: Number(e.target.value), isFree: false })}
                      disabled={zone.isFree || !zone.isEnabled}
                      className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:bg-gray-100 disabled:text-gray-300" />
                    <span className="text-xs text-gray-400 shrink-0">{currency}</span>
                    <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                      <input type="checkbox" checked={zone.isFree}
                        onChange={e => setZone(i, { isFree: e.target.checked, price: e.target.checked ? 0 : zone.price })}
                        disabled={!zone.isEnabled} className="w-3.5 h-3.5 accent-emerald-600 disabled:opacity-40" />
                      <span className={clsx('text-xs font-medium', zone.isEnabled ? 'text-emerald-700' : 'text-gray-400')}>{isRTL ? 'مجاني' : 'Free'}</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">{isRTL ? 'رجوع' : 'Back'}</button>
              <button onClick={() => setStep(4)} className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700">
                {isRTL ? 'التالي' : 'Next'} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Automation & Notifications ── */}
        {step === 4 && (
          <div id="p2p-automation-section" className="space-y-5">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{isRTL ? 'إعدادات الأتمتة' : 'Automation'}</p>
              <div className="bg-gray-50 rounded-xl divide-y divide-gray-100">
                <SettingToggle
                  label={isRTL ? 'إدراج المنتجات قريبة الانتهاء تلقائياً' : 'Auto-list near-expiry products'}
                  desc={isRTL ? 'إدراج منتجات الصلاحية القريبة تلقائياً كتصفية' : 'Automatically list expiring items as clearance'}
                  value={form.automations.autoListNearExpiry} onChange={v => setAuto('autoListNearExpiry', v)} />
                <SettingToggle
                  label={isRTL ? 'تحديث الخصوم تلقائياً' : 'Auto-update discounts'}
                  desc={isRTL ? 'تعديل الخصومات تلقائياً لتسريع البيع' : 'Adjust discounts automatically to accelerate sales'}
                  value={form.automations.autoUpdateDiscounts} onChange={v => setAuto('autoUpdateDiscounts', v)} />
                <SettingToggle
                  label={isRTL ? 'تحميل الفاتورة عند اكتمال الطلب' : 'Auto-download invoice on completion'}
                  desc={isRTL ? 'تحميل فاتورة التحويل تلقائياً عند إتمام الطلب' : 'Auto-download transfer invoice when order completes'}
                  value={form.automations.autoDownloadInvoice} onChange={v => setAuto('autoDownloadInvoice', v)} />
                <SettingToggle
                  label={isRTL ? '🤖 الشراء الذكي من السوق' : '🤖 Smart P2P Procurement'}
                  desc={isRTL ? 'عند انخفاض المخزون، يقترح الذكاء الاصطناعي أفضل سعر من السوق' : 'When stock is low, AI suggests the best P2P deal for your approval'}
                  value={form.automations.autoProcurement} onChange={v => setAuto('autoProcurement', v)} />
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{isRTL ? 'تفضيلات الإشعارات' : 'Notifications'}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {(isRTL ? [
                  { k: 'newOrders', l: 'الطلبات الجديدة' },
                  { k: 'orderActivity', l: 'نشاط الطلبات' },
                  { k: 'autoListings', l: 'الإدراجات التلقائية' },
                  { k: 'priceAlerts', l: 'تنبيهات الأسعار' },
                  { k: 'expiryWarnings', l: 'تحذيرات انتهاء الصلاحية' },
                  { k: 'aiRecommendations', l: '🤖 توصيات الذكاء الاصطناعي' },
                ] : [
                  { k: 'newOrders', l: 'New orders' },
                  { k: 'orderActivity', l: 'Order activity' },
                  { k: 'autoListings', l: 'Auto-listing events' },
                  { k: 'priceAlerts', l: 'Price alerts' },
                  { k: 'expiryWarnings', l: 'Expiry warnings' },
                  { k: 'aiRecommendations', l: '🤖 AI recommendations' },
                ]).map(({ k, l }) => (
                  <label key={k} className="flex items-center gap-3 cursor-pointer px-3 py-2 rounded-xl hover:bg-gray-50">
                    <input type="checkbox"
                      checked={form.notificationPrefs[k as keyof typeof form.notificationPrefs]}
                      onChange={e => setNotif(k as keyof typeof form.notificationPrefs, e.target.checked)}
                      className="w-4 h-4 accent-emerald-600 shrink-0" />
                    <span className="text-sm text-gray-700">{l}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-between">
              <button onClick={() => setStep(3)} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">{isRTL ? 'رجوع' : 'Back'}</button>
              <button onClick={() => setStep(5)} className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700">
                {isRTL ? 'التالي' : 'Next'} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: Visibility + Save ── */}
        {step === 5 && (
          <div id="p2p-save-section" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <label className="flex items-start gap-4 cursor-pointer p-4 rounded-2xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-all">
                <input type="checkbox" checked={form.isVisible}
                  onChange={e => setForm(f => ({ ...f, isVisible: e.target.checked }))}
                  className="w-5 h-5 accent-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">{isRTL ? 'الظهور في سوق التبادل' : 'Show in Exchange Marketplace'}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    {isRTL
                      ? 'عند التفعيل، تظهر إعلاناتك لجميع الصيدليات الأخرى في الشبكة'
                      : 'When enabled, your listings are visible to all pharmacies on the network'}
                  </p>
                </div>
              </label>
              <div className="p-4 rounded-2xl border border-gray-100 bg-gray-50 text-xs text-gray-500 space-y-2">
                <p className="font-semibold text-gray-700 text-sm">{isRTL ? 'ماذا يحدث بعد الحفظ؟' : 'What happens next?'}</p>
                {(isRTL
                  ? ['يُرسَل ملفك للمراجعة', 'بعد التحقق تظهر إعلاناتك', 'يمكنك التعديل في أي وقت']
                  : ['Profile sent for admin review', 'Once verified, listings go live', 'Edit settings anytime']
                ).map((t, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    {t}
                  </div>
                ))}
              </div>
            </div>

            {upsertMutation.isSuccess && (
              <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-xl p-3.5 text-sm font-medium border border-emerald-200">
                <CheckCircle2 size={16} className="shrink-0" />
                {isRTL ? 'تم حفظ الملف الشخصي بنجاح 🎉' : 'Seller profile saved successfully 🎉'}
              </div>
            )}
            {upsertMutation.isError && (
              <div className="flex items-center gap-2 text-red-700 bg-red-50 rounded-xl p-3.5 text-sm font-medium border border-red-200">
                <XCircle size={16} className="shrink-0" />
                {isRTL ? 'حدث خطأ أثناء الحفظ' : 'Error saving, please try again'}
              </div>
            )}

            <div className="flex justify-between">
              <button onClick={() => setStep(4)} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">{isRTL ? 'رجوع' : 'Back'}</button>
              <button onClick={() => upsertMutation.mutate()} disabled={upsertMutation.isPending || !form.legalName.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {upsertMutation.isPending
                  ? (isRTL ? 'جاري الحفظ...' : 'Saving...')
                  : (isRTL ? 'حفظ الملف الشخصي' : 'Save Profile')}
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

// ── INSIGHTS TAB (Phase 4 — AI Procurement + Market Intelligence) ────────────

function InsightsTab({ isRTL }: { isRTL: boolean }) {
  const [, setSearchParams] = useSearchParams()

  const { data: opportunities, isLoading: loadingOpp } = useQuery({
    queryKey: ['p2p-procurement-opportunities'],
    queryFn: () => p2pMarketplaceApi.getProcurementOpportunities({ limit: 50 }),
    staleTime: 5 * 60_000,
  })

  const qc = useQueryClient()
  const [procPage, setProcPage] = useState(0)
  const PROC_PER_PAGE = 10
  const [orderState, setOrderState] = useState<{ id: string; qty: number } | null>(null)
  const [orderedIds, setOrderedIds] = useState<Set<string>>(new Set())
  const { mutate: placeOrder, isPending: orderPending } = useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) =>
      p2pOrdersApi.create({ listingId: id, requestedQty: qty }),
    onSuccess: (_: unknown, vars: { id: string; qty: number }) => {
      setOrderedIds(s => new Set([...s, vars.id]))
      setOrderState(null)
      qc.invalidateQueries({ queryKey: ['p2p-orders'] })
    },
  })
  const pagedOpps = useMemo(
    () => (opportunities ?? []).slice(procPage * PROC_PER_PAGE, (procPage + 1) * PROC_PER_PAGE),
    [opportunities, procPage],
  )
  const totalPages = Math.ceil((opportunities?.length ?? 0) / PROC_PER_PAGE)

  const { data: intel, isLoading: loadingIntel } = useQuery({
    queryKey: ['p2p-market-intelligence'],
    queryFn: () => p2pMarketplaceApi.getIntelligence(),
    staleTime: 10 * 60_000,
  })

  const { data: expiryAlerts, isLoading: loadingExpiry } = useQuery({
    queryKey: ['p2p-expiry-alerts'],
    queryFn: p2pSellerApi.getExpiryAlerts,
    staleTime: 5 * 60_000,
  })

  const { data: settings } = useQuery({
    queryKey: ['pharmacy-settings'],
    queryFn: pharmacySettingsApi.getSettings,
    staleTime: 60 * 60_000,
  })
  const currency = settings?.currency ?? 'SAR'

  // Revenue impact calculations
  const urgentAlerts = expiryAlerts?.filter(a => a.urgency === 'critical' || a.urgency === 'high') ?? []
  const urgentUnits = urgentAlerts.reduce((sum, a) => sum + a.quantity, 0)
  const sellTotal = expiryAlerts?.length ?? 0
  const unlistedCount = (expiryAlerts ?? []).filter(a => !a.alreadyListed).length

  const savingsOpps = (opportunities ?? []).filter(o => o.savingsPct != null && o.savingsPct > 0)
  const avgSavingsPct = savingsOpps.length
    ? Math.round(savingsOpps.reduce((s, o) => s + (o.savingsPct ?? 0), 0) / savingsOpps.length)
    : 0

  return (
    <div className="space-y-6">

      {/* ── Revenue Impact Banner ── */}
      {(!loadingExpiry || !loadingOpp) && (urgentUnits > 0 || savingsOpps.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {urgentUnits > 0 && (
            <div className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3">
              <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                <AlertCircle size={16} className="text-red-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-red-800">
                  {urgentUnits.toLocaleString()} {isRTL ? 'وحدة في خطر' : 'units at expiry risk'}
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  {isRTL
                    ? `${urgentAlerts.length} منتج بصلاحية حرجة — يوصى بالإدراج الفوري`
                    : `${urgentAlerts.length} items critical/high urgency — list now to recover value`}
                </p>
                {unlistedCount > 0 && (
                  <button
                    onClick={() => setSearchParams({ tab: 'sell' })}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-900 transition-colors"
                  >
                    {isRTL ? `إدراج ${unlistedCount} منتج الآن` : `List ${unlistedCount} items now`}
                    <ArrowRight size={11} />
                  </button>
                )}
              </div>
            </div>
          )}
          {savingsOpps.length > 0 && (
            <div className="bg-gradient-to-br from-emerald-50 to-violet-50 border border-emerald-100 rounded-2xl p-4 flex items-start gap-3">
              <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                <DollarSign size={16} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-800">
                  {isRTL ? `وفّر حتى ${avgSavingsPct}% على مشترياتك` : `Save up to ${avgSavingsPct}% on procurement`}
                </p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  {isRTL
                    ? `${savingsOpps.length} فرصة شراء بسعر أقل من المورّد`
                    : `${savingsOpps.length} items cheaper on P2P than your supplier`}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Expiry Risk Summary (compact — full list is in Sell tab) ── */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <TrendingDown size={16} className="text-gray-500" />
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {isRTL ? 'تنبيهات انتهاء الصلاحية' : 'Expiry Alerts'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {isRTL ? 'ملخص سريع — لعرض الكل اذهب إلى تبويب البيع' : 'Quick summary — go to Sell tab for full list'}
              </p>
            </div>
          </div>
          {sellTotal > 0 && (
            <button
              onClick={() => setSearchParams({ tab: 'sell' })}
              className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              {isRTL ? `عرض الكل (${sellTotal})` : `View all (${sellTotal})`}
              <ArrowRight size={12} />
            </button>
          )}
        </div>

        {loadingExpiry && (
          <div className="flex items-center justify-center py-8 text-gray-300">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}

        {!loadingExpiry && sellTotal === 0 && (
          <div className="flex items-center gap-3 px-5 py-5">
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-700">{isRTL ? 'مخزونك بأمان ✓' : 'All clear'}</p>
              <p className="text-xs text-gray-400 mt-0.5">{isRTL ? 'لا توجد منتجات قريبة الانتهاء' : 'No items expiring within 180 days'}</p>
            </div>
          </div>
        )}

        {!loadingExpiry && sellTotal > 0 && (
          <div className="px-5 py-4 space-y-3">
            {/* Urgency breakdown pills */}
            <div className="flex flex-wrap gap-2">
              {(['critical', 'high', 'medium', 'low'] as const).map(u => {
                const count = (expiryAlerts ?? []).filter(a => a.urgency === u).length
                if (!count) return null
                const styles = {
                  critical: 'bg-red-100 text-red-700 border-red-200',
                  high: 'bg-orange-100 text-orange-700 border-orange-200',
                  medium: 'bg-amber-100 text-amber-700 border-amber-200',
                  low: 'bg-gray-100 text-gray-600 border-gray-200',
                }[u]
                const labelAr = { critical: 'حرج', high: 'عالٍ', medium: 'متوسط', low: 'منخفض' }[u]
                return (
                  <span key={u} className={clsx('inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium border', styles)}>
                    <span className={clsx('w-1.5 h-1.5 rounded-full', {
                      critical: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-amber-400', low: 'bg-gray-400',
                    }[u])} />
                    {count} {isRTL ? labelAr : u}
                  </span>
                )
              })}
            </div>

            {/* Top 3 most urgent, not yet listed */}
            {urgentAlerts.filter(a => !a.alreadyListed).slice(0, 3).map(alert => (
              <div key={alert.inventoryItemId} className="flex items-center gap-3 py-1.5">
                <div className={clsx('w-2 h-2 rounded-full shrink-0', alert.urgency === 'critical' ? 'bg-red-500' : 'bg-orange-400')} />
                <span className="text-sm text-gray-800 flex-1 truncate">
                  {isRTL ? (alert.productNameAr || alert.productName || 'منتج غير معروف') : (alert.productName || 'Unknown')}
                </span>
                <span className={clsx('text-xs tabular-nums shrink-0', alert.urgency === 'critical' ? 'text-red-600 font-semibold' : 'text-orange-600')}>
                  {alert.daysLeft}d
                </span>
                <button
                  onClick={() => setSearchParams({ tab: 'sell', openAdd: '1', itemId: alert.inventoryItemId })}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-700 transition-colors shrink-0"
                >
                  {isRTL ? 'إدراج' : 'List'}
                </button>
              </div>
            ))}

            {unlistedCount > 3 && (
              <button
                onClick={() => setSearchParams({ tab: 'sell' })}
                className="w-full text-center text-xs text-gray-400 hover:text-emerald-600 transition-colors py-1"
              >
                {isRTL ? `+ ${unlistedCount - 3} منتج آخر` : `+ ${unlistedCount - 3} more items`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Procurement Opportunities ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
              <DollarSign size={18} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">
                {isRTL ? 'فرص الشراء الذكي' : 'Smart Procurement Opportunities'}
              </h2>
              <p className="text-xs text-gray-500">
                {isRTL
                  ? 'منتجات تحتاجها بسعر أقل من الموردين — اطلب مباشرة من هنا'
                  : 'Items you need cheaper on P2P — order directly from here'}
              </p>
            </div>
          </div>
          {(opportunities?.length ?? 0) > 0 && (
            <span className="text-xs text-gray-400 tabular-nums">
              {isRTL ? `${opportunities!.length} فرصة` : `${opportunities!.length} opportunities`}
            </span>
          )}
        </div>

        {loadingOpp && (
          <div className="flex items-center justify-center h-24 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}

        {!loadingOpp && !opportunities?.length && (
          <div className="py-14 text-center bg-white rounded-2xl border border-gray-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <DollarSign size={24} className="text-emerald-500" />
            </div>
            <p className="text-sm font-semibold text-gray-800">
              {isRTL ? 'لا توجد فرص شراء حالياً' : 'No procurement opportunities right now'}
            </p>
            <p className="text-xs text-gray-400 mt-1.5 max-w-[240px] mx-auto leading-relaxed">
              {isRTL
                ? 'سنُنبّهك تلقائياً حين يعرض بائع منتجاً تحتاجه بسعر أقل من مورّدك'
                : "We'll notify you when a P2P seller offers an item cheaper than your supplier"}
            </p>
          </div>
        )}

        {!loadingOpp && (opportunities?.length ?? 0) > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" dir={isRTL ? 'rtl' : 'ltr'}>
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="text-start px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      {isRTL ? 'المنتج' : 'Product'}
                    </th>
                    <th className="text-start px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {isRTL ? 'الكود' : 'Code'}
                    </th>
                    <th className="text-end px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {isRTL ? 'مخزوني' : 'My Stock'}
                    </th>
                    <th className="text-end px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {isRTL ? 'متاح' : 'Available'}
                    </th>
                    <th className="text-end px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {isRTL ? 'سعر P2P' : 'P2P Price'}
                    </th>
                    <th className="text-end px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {isRTL ? 'سعر المورد' : 'Supplier'}
                    </th>
                    <th className="text-end px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {isRTL ? 'التوفير' : 'Savings'}
                    </th>
                    <th className="text-start px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {isRTL ? 'البائع' : 'Seller'}
                    </th>
                    <th className="text-start px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {isRTL ? 'المصدر' : 'Source'}
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap text-center">
                      {isRTL ? 'إجراء' : 'Action'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pagedOpps.map((opp) => {
                    const code = opp.barcode ?? opp.sku ?? opp.productId.slice(0, 8)
                    const name = isRTL ? (opp.productNameAr || opp.productName || '—') : (opp.productName || '—')
                    const hasSavings = (opp.savingsPct ?? 0) > 0
                    const isExpanded = orderState?.id === opp.p2pListingId
                    const isOrdered = orderedIds.has(opp.p2pListingId ?? '')
                    const isP2P = opp.sourceType === 'p2p'

                    return (
                      <React.Fragment key={opp.p2pListingId ?? opp.productId}>
                        <tr className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="flex items-start gap-1.5">
                              {opp.listingType === 'clearance' && <Flame size={11} className="text-orange-500 shrink-0 mt-0.5" />}
                              {opp.listingType === 'emergency' && <Zap size={11} className="text-red-500 shrink-0 mt-0.5" />}
                              <div>
                                <span className="text-sm font-medium text-gray-900 truncate max-w-[180px] block">{name}</span>
                                {/* Rationale — why the AI picked this item */}
                                <span className="text-[11px] text-gray-400 leading-tight block max-w-[min(220px,calc(100vw-32px))]">
                                  {(() => {
                                    const parts: string[] = []
                                    const gap = opp.minThreshold - opp.currentQty
                                    if (gap > 0) parts.push(isRTL ? `نقص ${gap} وحدة` : `${gap} units below min`)
                                    if ((opp.savingsPct ?? 0) > 0) parts.push(isRTL ? `أوفر ${opp.savingsPct}% من مورّدك` : `${opp.savingsPct}% vs supplier`)
                                    if (opp.distanceKm != null) parts.push(isRTL ? `${opp.distanceKm.toFixed(1)} كم` : `${opp.distanceKm.toFixed(1)} km away`)
                                    if (opp.sourceType === 'supplier' && !opp.p2pListingId) parts.push(isRTL ? 'لا يوجد عرض P2P — اطلب من مورّدك' : 'no P2P yet — use supplier')
                                    return parts.join(' · ')
                                  })()}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="text-xs font-mono text-gray-500">{code}</span>
                          </td>
                          <td className="px-4 py-3.5 text-end whitespace-nowrap">
                            <span className={clsx('text-sm font-semibold tabular-nums', opp.currentQty === 0 ? 'text-red-600' : 'text-orange-600')}>
                              {opp.currentQty}
                            </span>
                            <span className="text-xs text-gray-400">/{opp.minThreshold}</span>
                          </td>
                          <td className="px-4 py-3.5 text-end whitespace-nowrap">
                            <span className="text-sm tabular-nums text-gray-700">{opp.availableQty ?? '—'}</span>
                          </td>
                          <td className="px-4 py-3.5 text-end whitespace-nowrap">
                            {opp.p2pPrice != null ? (
                              <span className="text-sm font-semibold tabular-nums text-emerald-700">
                                {opp.p2pPrice} <span className="text-[10px] font-normal text-gray-400">{currency}</span>
                              </span>
                            ) : <span className="text-gray-400 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3.5 text-end whitespace-nowrap">
                            {opp.bestSupplierPrice != null ? (
                              <span className={clsx('text-sm tabular-nums', hasSavings ? 'line-through text-gray-400' : 'text-gray-700')}>
                                {opp.bestSupplierPrice} <span className="text-[10px] font-normal text-gray-400">{currency}</span>
                              </span>
                            ) : <span className="text-gray-400 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3.5 text-end whitespace-nowrap">
                            {hasSavings ? (
                              <span className="inline-flex items-center text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                {isRTL ? `وفّر ${opp.savingsPct}%` : `${opp.savingsPct}% off`}
                              </span>
                            ) : <span className="text-gray-400 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {opp.sellerName ? (
                              <div>
                                <p className="text-sm font-medium text-gray-800">{opp.sellerName}</p>
                                <p className="flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
                                  {opp.sellerCity && <><MapPin size={9} />{opp.sellerCity}</>}
                                  {opp.distanceKm != null && <span>{opp.distanceKm.toFixed(1)} كم</span>}
                                </p>
                              </div>
                            ) : <span className="text-gray-400 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className={clsx(
                              'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border',
                              isP2P
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-gray-100 text-gray-600 border-gray-200',
                            )}>
                              {isP2P ? <Store size={9} /> : <Truck size={9} />}
                              {isP2P ? 'P2P' : (isRTL ? 'مورد' : 'Supplier')}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            {isOrdered ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                <CheckCircle2 size={13} />{isRTL ? 'تم' : 'Done'}
                              </span>
                            ) : !isP2P ? (
                              <span className="text-[11px] text-gray-400">{isRTL ? 'راجع الموردين' : 'See suppliers'}</span>
                            ) : (
                              <button
                                onClick={() => {
                                  if (isExpanded) { setOrderState(null); return }
                                  setOrderState({ id: opp.p2pListingId!, qty: Math.max(1, opp.minThreshold - opp.currentQty) })
                                }}
                                className={clsx(
                                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors',
                                  isExpanded
                                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    : 'bg-violet-700 text-white hover:bg-violet-800',
                                )}
                              >
                                <ShoppingCart size={11} />
                                {isExpanded ? (isRTL ? 'إلغاء' : 'Cancel') : (isRTL ? 'اطلب' : 'Order')}
                              </button>
                            )}
                          </td>
                        </tr>
                        {isExpanded && isP2P && (
                          <tr className="bg-emerald-50/60">
                            <td colSpan={10} className="px-6 py-3 border-b border-emerald-100">
                              <div className="flex items-center gap-4 flex-wrap">
                                <p className="text-sm font-medium text-gray-700 shrink-0">
                                  {isRTL ? 'الكمية المطلوبة:' : 'Qty to order:'}
                                </p>
                                <input
                                  type="number" min={1} max={opp.availableQty ?? 9999}
                                  value={orderState!.qty}
                                  onChange={e => setOrderState(s => s ? { ...s, qty: Math.max(1, parseInt(e.target.value) || 1) } : s)}
                                  className="w-24 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400"
                                />
                                <p className="text-xs text-gray-500">
                                  {isRTL
                                    ? `متاح: ${opp.availableQty} — الإجمالي: ${((orderState?.qty ?? 1) * (opp.p2pPrice ?? 0)).toFixed(2)} ${currency}`
                                    : `Available: ${opp.availableQty} — Total: ${((orderState?.qty ?? 1) * (opp.p2pPrice ?? 0)).toFixed(2)} ${currency}`}
                                </p>
                                <button
                                  onClick={() => placeOrder({ id: opp.p2pListingId!, qty: orderState!.qty })}
                                  disabled={orderPending}
                                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors ms-auto"
                                >
                                  {orderPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                  {isRTL ? 'تأكيد الطلب' : 'Confirm Order'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                <p className="text-xs text-gray-500">
                  {isRTL
                    ? `${procPage * PROC_PER_PAGE + 1}–${Math.min((procPage + 1) * PROC_PER_PAGE, opportunities!.length)} من ${opportunities!.length}`
                    : `${procPage * PROC_PER_PAGE + 1}–${Math.min((procPage + 1) * PROC_PER_PAGE, opportunities!.length)} of ${opportunities!.length}`}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setProcPage(p => p - 1); setOrderState(null) }} disabled={procPage === 0}
                    className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <ChevronRight size={14} className={isRTL ? '' : 'rotate-180'} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <button key={i} onClick={() => { setProcPage(i); setOrderState(null) }}
                      className={clsx('w-7 h-7 rounded-lg text-xs font-medium transition-colors',
                        i === procPage ? 'bg-emerald-600 text-white' : 'hover:bg-gray-200 text-gray-600')}>
                      {i + 1}
                    </button>
                  ))}
                  <button onClick={() => { setProcPage(p => p + 1); setOrderState(null) }} disabled={procPage === totalPages - 1}
                    className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <ChevronLeft size={14} className={isRTL ? '' : 'rotate-180'} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Market Intelligence ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
            <BarChart2 size={18} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900">
              {isRTL ? 'ذكاء السوق' : 'Market Intelligence'}
            </h2>
            <p className="text-xs text-gray-500">
              {isRTL ? 'إحصاءات مجهولة الهوية من جميع الصيدليات في الشبكة' : 'Anonymized stats across the network'}
            </p>
          </div>
        </div>

        {loadingIntel && (
          <div className="flex items-center justify-center h-24 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}

        {intel && (
          <div className="space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { labelAr: 'بائعون نشطون', labelEn: 'Active Sellers', value: intel.activeSellersCount, icon: Store, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { labelAr: 'إعلانات نشطة', labelEn: 'Active Listings', value: intel.activeListingsCount, icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { labelAr: 'منتجات في السوق', labelEn: 'Products Listed', value: intel.avgPricesByProduct.length, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { labelAr: 'مدن نشطة', labelEn: 'Active Cities', value: intel.cityDensity.length, icon: MapPin, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              ].map(({ labelAr, labelEn, value, icon: Icon, color, bg }) => (
                <div key={labelEn} className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
                  <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-2', bg)}>
                    <Icon size={16} className={color} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{isRTL ? labelAr : labelEn}</p>
                </div>
              ))}
            </div>

            {/* Top traded products */}
            {intel.topTradedProducts.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  {isRTL ? 'الأكثر تداولاً (آخر 30 يوم)' : 'Most Traded (last 30 days)'}
                </h3>
                <div className="space-y-2.5">
                  {intel.topTradedProducts.slice(0, 5).map((p, i) => {
                    const displayName = isRTL ? (p.productNameAr || p.productName) : p.productName
                    return (
                      <div key={p.productId} className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-gray-100 text-[11px] font-bold text-gray-500 flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <span className={clsx('text-sm flex-1 truncate', displayName ? 'text-gray-800 font-medium' : 'text-gray-400 font-mono text-xs')}>
                          {displayName ?? `#${p.productId.slice(0, 10)}`}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-gray-600 shrink-0">
                          <span className="font-semibold">{p.orderCount}</span>
                          <span className="text-gray-400">{isRTL ? 'طلب' : 'orders'}</span>
                          <span className="text-gray-300">·</span>
                          <span className="font-semibold">{p.totalVolume}</span>
                          <span className="text-gray-400">{isRTL ? 'وحدة' : 'units'}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* City density */}
            {intel.cityDensity.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  {isRTL ? 'كثافة الشبكة بالمدينة' : 'Network Density by City'}
                </h3>
                <div className="space-y-2">
                  {intel.cityDensity.slice(0, 5).map(c => {
                    const maxCount = intel.cityDensity[0]?.sellerCount ?? 1
                    const pct = Math.round((c.sellerCount / maxCount) * 100)
                    return (
                      <div key={c.city} className="flex items-center gap-3">
                        <span className="text-xs font-medium text-gray-700 w-24 shrink-0 truncate">
                          {c.city}
                        </span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-400 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right shrink-0">{c.sellerCount}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


// ── EXPIRY ALERTS PANEL ───────────────────────────────────────────────────────

function ExpiryAlertsPanel({ isRTL }: { isRTL: boolean }) {
  const [, setSearchParams] = useSearchParams()
  const [priceProductId, setPriceProductId] = useState('')
  const [priceInput, setPriceInput] = useState('')

  const { data: alerts, isLoading, isError, refetch } = useQuery({
    queryKey: ['p2p-expiry-alerts'],
    queryFn: p2pSellerApi.getExpiryAlerts,
    staleTime: 5 * 60_000,
    retry: 1,
  })

  // urgency → left border color + dot color only (no background tinting)
  const urgencyDot: Record<ExpiryAlert['urgency'], string> = {
    critical: 'bg-red-500',
    high:     'bg-orange-400',
    medium:   'bg-amber-400',
    low:      'bg-gray-300',
  }
  const urgencyBorder: Record<ExpiryAlert['urgency'], string> = {
    critical: 'border-l-red-400',
    high:     'border-l-orange-300',
    medium:   'border-l-amber-300',
    low:      'border-l-gray-200',
  }
  const urgencyLabel: Record<ExpiryAlert['urgency'], { ar: string; en: string }> = {
    critical: { ar: 'حرج',   en: 'Critical' },
    high:     { ar: 'عالٍ',  en: 'High' },
    medium:   { ar: 'متوسط', en: 'Medium' },
    low:      { ar: 'منخفض', en: 'Low' },
  }
  const actionLabel: Record<ExpiryAlert['suggestedAction'], { ar: string; en: string }> = {
    list_clearance:    { ar: 'إدراج تصفية',  en: 'List Sale' },
    increase_discount: { ar: 'رفع الخصم',    en: 'Boost Discount' },
    list_normal:       { ar: 'إدراج الآن',   en: 'List Now' },
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <TrendingDown size={16} className="text-gray-500" />
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {isRTL ? 'حماية المخزون' : 'Expiry Protection'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {isRTL ? 'منتجات تنتهي صلاحيتها خلال 180 يوماً' : 'Items expiring within 180 days'}
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-10 text-gray-300">
          <Loader2 size={18} className="animate-spin" />
        </div>
      )}

      {/* Error */}
      {!isLoading && isError && (
        <div className="flex items-center gap-3 px-5 py-6">
          <AlertTriangle size={16} className="text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-700">{isRTL ? 'تعذّر تحميل البيانات' : 'Failed to load'}</p>
            <button onClick={() => refetch()} className="text-xs text-blue-500 hover:underline mt-0.5">
              {isRTL ? 'إعادة المحاولة' : 'Retry'}
            </button>
          </div>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && !alerts?.length && (
        <div className="flex items-center gap-3 px-5 py-6">
          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-700">{isRTL ? 'مخزونك بأمان' : 'All clear'}</p>
            <p className="text-xs text-gray-400 mt-0.5">{isRTL ? 'لا توجد منتجات قريبة الانتهاء' : 'No items expiring within 180 days'}</p>
          </div>
        </div>
      )}

      {/* Alert list */}
      {!isLoading && !!alerts?.length && (
        <div className="divide-y divide-gray-100">
          {/* Summary row */}
          <div className="flex items-center justify-between px-5 py-2.5 bg-gray-50/60">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="font-semibold text-gray-700">{alerts.length}</span>
              {isRTL ? 'منتج تحت المراقبة' : 'items monitored'}
              {alerts.filter(a => a.urgency === 'critical').length > 0 && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="flex items-center gap-1 font-semibold text-red-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                    {alerts.filter(a => a.urgency === 'critical').length} {isRTL ? 'حرج' : 'critical'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Item rows */}
          {alerts.map(alert => (
            <div
              key={alert.inventoryItemId}
              className={clsx(
                'flex items-center gap-4 px-5 py-3.5 border-l-2 hover:bg-gray-50/40 transition-colors',
                urgencyBorder[alert.urgency],
              )}
            >
              {/* Dot */}
              <div className={clsx('w-2 h-2 rounded-full shrink-0', urgencyDot[alert.urgency])} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900 truncate">
                    {isRTL ? (alert.productNameAr || alert.productName) : alert.productName || (isRTL ? 'منتج غير معروف' : 'Unknown product')}
                  </span>
                  {alert.productCode && (
                    <span className="text-[10px] font-mono text-gray-400 shrink-0">{alert.productCode}</span>
                  )}
                  <span className="text-[10px] text-gray-400 font-medium shrink-0">
                    {isRTL ? urgencyLabel[alert.urgency].ar : urgencyLabel[alert.urgency].en}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-800 mt-0.5 tabular-nums">
                  {alert.quantity.toLocaleString()} {isRTL ? 'وحدة' : 'units'}
                  <span className="text-gray-400 mx-1.5">·</span>
                  <span className={alert.urgency === 'critical' ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                    {alert.daysLeft} {isRTL ? 'يوم' : 'd'}
                  </span>
                  {alert.suggestedDiscountPct > 0 && (
                    <span className="text-gray-400 ms-2 text-xs font-normal">
                      {isRTL ? `خصم مقترح ${alert.suggestedDiscountPct}%` : `${alert.suggestedDiscountPct}% off`}
                    </span>
                  )}
                </p>
              </div>

              {/* Action */}
              {alert.alreadyListed ? (
                <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium shrink-0">
                  <CheckCircle2 size={12} />
                  {isRTL ? 'مدرج' : 'Listed'}
                </span>
              ) : (
                <button
                  onClick={() => setSearchParams({ tab: 'sell', openAdd: '1', itemId: alert.inventoryItemId })}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-700 transition-colors shrink-0"
                >
                  <Plus size={10} />
                  {isRTL
                    ? actionLabel[alert.suggestedAction].ar
                    : actionLabel[alert.suggestedAction].en}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Price History Section ── */}
      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <TrendingUp size={15} className="text-emerald-600" />
          <p className="text-sm font-bold text-gray-800">{isRTL ? 'تاريخ أسعار الموردين' : 'Supplier Price History'}</p>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-[11px] text-gray-400">{isRTL ? 'أدخل معرّف المنتج (Product ID) لعرض منحنى سعره عبر الزمن' : 'Enter a product ID to view its price trend'}</p>
          <div className="flex gap-2">
            <input
              value={priceInput}
              onChange={e => setPriceInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && priceInput.trim()) setPriceProductId(priceInput.trim()) }}
              placeholder={isRTL ? 'معرّف المنتج...' : 'Product ID...'}
              className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-violet-400 font-mono"
            />
            <button
              onClick={() => { if (priceInput.trim()) setPriceProductId(priceInput.trim()) }}
              className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-colors"
            >
              {isRTL ? 'عرض' : 'Show'}
            </button>
          </div>
          {priceProductId && (
            <PriceTrendPanel productId={priceProductId} title={isRTL ? 'منحنى السعر' : 'Price Curve'} />
          )}
        </div>
      </div>

      {/* ── Expiry Clearance shortcut ── */}
      <button
        onClick={() => window.location.href = '/pharmacy/ai-center?tab=tasks&task=expiry_clearance'}
        className="w-full rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 flex items-center gap-4 hover:shadow-md hover:border-amber-300 transition-all group text-start"
      >
        <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 text-lg">⏱️</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-900">
            {isRTL ? 'تصفية المخزون قرب الانتهاء — متاح الآن' : 'Near-Expiry Clearance — Available Now'}
          </p>
          <p className="text-[11px] text-amber-700/80 mt-0.5 leading-relaxed">
            {isRTL
              ? 'الذكاء الاصطناعي يكشف المنتجات قرب الانتهاء ويُنشئ إدراجات بخصم يتزايد تلقائياً — موافقتك تكفي'
              : 'AI detects near-expiry items and creates auto-deepening discount listings — just approve'}
          </p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-lg group-hover:bg-amber-200 transition-colors whitespace-nowrap">
          {isRTL ? 'افتح المهام ←' : 'Open Tasks →'}
        </span>
      </button>
    </div>
  )
}

