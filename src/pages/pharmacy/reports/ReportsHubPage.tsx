import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  TrendingUp, Package, Clock, BarChart2,
  ChevronLeft, Sparkles, Zap, ArrowUpRight, Shield, DollarSign, Layers,
  ShoppingBag, Truck, Users,
} from 'lucide-react'
import { AiReportAssistant } from './components/AiReportAssistant'
import { ReportHistory } from './components/ReportHistory'
import { useReportHistory } from './hooks/useReportHistory'

const DOMAINS = [
  {
    key: 'sales-summary', label: 'ملخص المبيعات',
    desc: 'تقرير يومي وشهري شامل — صافي المبيعات، هامش الربح، تكلفة البضاعة، مقارنة بالفترة السابقة',
    icon: BarChart2, color: 'text-violet-600', leftBorder: 'border-l-violet-500',
    route: '/pharmacy/reports/sales-summary', tag: 'مبيعات',
  },
  {
    key: 'sales-by-product', label: 'المبيعات حسب الصنف',
    desc: 'تحليل أداء كل صنف على حدة — الكميات، الهامش، المرتجعات، تكلفة البضاعة يومياً',
    icon: TrendingUp, color: 'text-indigo-600', leftBorder: 'border-l-indigo-400',
    route: '/pharmacy/reports/sales-by-product', tag: 'مبيعات',
  },
  {
    key: 'inventory-current', label: 'المخزون الحالي',
    desc: 'نظرة شاملة على المخزون — القيم، الصلاحيات، الخصومات، الأصناف المنخفضة',
    icon: Package, color: 'text-orange-600', leftBorder: 'border-l-orange-400',
    route: '/pharmacy/reports/inventory-current', tag: 'مخزون',
  },
  {
    key: 'expiry-report', label: 'تقرير تواريخ الانتهاء',
    desc: 'تواريخ انتهاء صلاحية كل تشغيلة — الأصناف المنتهية والقريبة وقيمة الخسائر المحتملة',
    icon: Clock, color: 'text-amber-600', leftBorder: 'border-l-amber-400',
    route: '/pharmacy/reports/expiry-report', tag: 'صلاحيات',
  },
  {
    key: 'insurance-claims', label: 'مطالبات التأمين',
    desc: 'ملخص مطالبات التأمين مجمّعة حسب الشركة والتاريخ — قيمة المبيعات والمبالغ المغطاة والمعلّقة',
    icon: Shield, color: 'text-emerald-600', leftBorder: 'border-l-emerald-500',
    route: '/pharmacy/reports/insurance-claims', tag: 'تأمين',
  },
  {
    key: 'profit-loss', label: 'الأرباح والخسائر',
    desc: 'قائمة الدخل السنوية — صافي الإيرادات والتكاليف وإجمالي الربح مع مقارنة العام السابق',
    icon: DollarSign, color: 'text-emerald-700', leftBorder: 'border-l-emerald-500',
    route: '/pharmacy/reports/profit-loss', tag: 'مالي',
  },
  {
    key: 'profitability-by-product', label: 'الربحية حسب المنتج',
    desc: 'ربحية كل صنف — الكميات المباعة والمرتجعة، هامش الربح، تكلفة البضاعة مقارنةً بالإيرادات',
    icon: TrendingUp, color: 'text-teal-600', leftBorder: 'border-l-teal-400',
    route: '/pharmacy/reports/profitability-by-product', tag: 'ربحية',
  },
  {
    key: 'profitability-by-category', label: 'الربحية حسب الفئة',
    desc: 'ربحية كل فئة دوائية — مقارنة الإيرادات والتكاليف وهامش الربح بين الفئات',
    icon: Layers, color: 'text-cyan-600', leftBorder: 'border-l-cyan-400',
    route: '/pharmacy/reports/profitability-by-category', tag: 'ربحية',
  },
  {
    key: 'procurement-spend', label: 'الإنفاق على المشتريات',
    desc: 'تحليل موحد لكل قنوات الشراء — فواتير الموردين، طلبيات الشبكة، صفقات P2P، مع التوفير المحقق',
    icon: ShoppingBag, color: 'text-violet-600', leftBorder: 'border-l-violet-500',
    route: '/pharmacy/reports/procurement-spend', tag: 'مشتريات',
  },
  {
    key: 'supplier-performance', label: 'أداء الموردين',
    desc: 'بطاقة أداء لكل مورد — نسبة التوريد، الرفض، زمن التوصيل، السداد، وإجمالي الإنفاق',
    icon: Truck, color: 'text-blue-600', leftBorder: 'border-l-blue-500',
    route: '/pharmacy/reports/supplier-performance', tag: 'موردين',
  },
  {
    key: 'p2p-activity', label: 'نشاط شبكة P2P',
    desc: 'حركة الند-للند: شراء، بيع، صافي المركز، الصيدليات الشريكة والصفقات النشطة',
    icon: Users, color: 'text-emerald-600', leftBorder: 'border-l-emerald-500',
    route: '/pharmacy/reports/p2p-activity', tag: 'P2P',
  },
]

const QUICK = [
  { label: 'ملخص المبيعات',    route: '/pharmacy/reports/sales-summary',    icon: BarChart2, color: 'text-violet-600',   bg: 'bg-violet-50' },
  { label: 'المخزون الحالي',   route: '/pharmacy/reports/inventory-current', icon: Package,   color: 'text-orange-600', bg: 'bg-orange-50' },
  { label: 'انتهاء الصلاحية', route: '/pharmacy/reports/expiry-report',     icon: Clock,     color: 'text-amber-600',  bg: 'bg-amber-50' },
  { label: 'مطالبات التأمين',  route: '/pharmacy/reports/insurance-claims',  icon: Shield,      color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { label: 'الأرباح والخسائر', route: '/pharmacy/reports/profit-loss',       icon: DollarSign,  color: 'text-emerald-700', bg: 'bg-emerald-50' },
  { label: 'ربحية المنتجات',  route: '/pharmacy/reports/profitability-by-product',  icon: TrendingUp, color: 'text-teal-600',    bg: 'bg-teal-50' },
  { label: 'ربحية الفئات',    route: '/pharmacy/reports/profitability-by-category', icon: Layers,     color: 'text-cyan-600',    bg: 'bg-cyan-50' },
  { label: 'إنفاق المشتريات', route: '/pharmacy/reports/procurement-spend',          icon: ShoppingBag, color: 'text-violet-600', bg: 'bg-violet-50' },
  { label: 'أداء الموردين',   route: '/pharmacy/reports/supplier-performance',       icon: Truck,       color: 'text-blue-600',   bg: 'bg-blue-50' },
  { label: 'نشاط P2P',        route: '/pharmacy/reports/p2p-activity',               icon: Users,       color: 'text-emerald-600',bg: 'bg-emerald-50' },
]

export default function ReportsHubPage() {
  const [showAi, setShowAi] = useState(false)
  const { history, remove } = useReportHistory()

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-start justify-between gap-5 p-6">
          <div className="flex items-start gap-5 min-w-0">
            <div className="p-4 rounded-2xl shrink-0 bg-violet-50">
              <BarChart2 size={28} className="text-violet-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-violet-500 uppercase tracking-wider mb-1">Pulse — مركز التقارير</p>
              <h1 className="text-2xl font-bold text-gray-900">تقارير صيدليتك في مكان واحد</h1>
              <p className="text-gray-500 mt-1.5 text-sm leading-relaxed max-w-xl">
                اختر التقرير الذي تريده — الأرقام مرتبة وواضحة مع إمكانية التصدير.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAi(o => !o)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors shrink-0 shadow-sm"
          >
            <Sparkles size={15} />
            المساعد الذكي
          </button>
        </div>
      </div>

      {/* Quick access */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap size={15} className="text-violet-500" />
          <h2 className="text-sm font-semibold text-gray-700">وصول سريع</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK.map(q => (
            <Link key={q.label} to={q.route}
              className="flex items-center gap-2.5 px-4 py-3 bg-white rounded-xl border border-gray-200 hover:border-violet-300 hover:shadow-sm transition-all group">
              <div className={`p-1.5 rounded-lg ${q.bg} shrink-0`}>
                <q.icon size={14} className={q.color} />
              </div>
              <span className="text-sm font-medium text-gray-800 group-hover:text-violet-700 transition-colors">{q.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Report cards */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-700">التقارير المتاحة</h2>
          <span className="text-xs text-gray-400">— 11 تقرير مفصل لمتابعة صيدليتك</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {DOMAINS.map(d => (
            <Link key={d.key} to={d.route}
              className={`group flex flex-col gap-3 p-5 bg-white rounded-2xl border border-gray-100 border-l-4 ${d.leftBorder} hover:shadow-md hover:border-gray-200 transition-all`}
            >
              <div className="flex items-center justify-between">
                <d.icon size={20} className={d.color} />
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{d.tag}</span>
                  <ChevronLeft size={15} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                </div>
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-[15px]">{d.label}</p>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{d.desc}</p>
              </div>
              <div className={`flex items-center gap-1 text-xs font-medium ${d.color} opacity-0 group-hover:opacity-100 transition-opacity`}>
                <span>فتح التقرير</span>
                <ArrowUpRight size={12} />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* History */}
      <ReportHistory history={history} onRemove={remove} />

      {/* AI side panel */}
      {showAi && (
        <AiReportAssistant domain="hub" domainLabel="مركز التقارير" onClose={() => setShowAi(false)} />
      )}
    </div>
  )
}

