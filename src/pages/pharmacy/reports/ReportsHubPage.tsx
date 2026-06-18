import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  TrendingUp, Package, Clock, DollarSign, ShieldCheck, BarChart2,
  ChevronLeft, Sparkles, Zap, ArrowUpRight,
} from 'lucide-react'
import { AiReportAssistant } from './components/AiReportAssistant'
import { ReportHistory } from './components/ReportHistory'
import { useReportHistory } from './hooks/useReportHistory'

const DOMAINS = [
  {
    key: 'sales', label: 'ذكاء المبيعات',
    desc: 'تحليل المبيعات اليومية ومقارنة الأداء والمنتجات الأكثر طلباً',
    icon: TrendingUp, color: 'text-emerald-600', leftBorder: 'border-l-emerald-400',
    route: '/pharmacy/reports/sales', tag: 'مبيعات',
  },
  {
    key: 'inventory', label: 'ذكاء المخزون',
    desc: 'مراقبة كميات المنتجات وتنبيهات النفاد وقيمة المخزون الكلية',
    icon: Package, color: 'text-blue-600', leftBorder: 'border-l-blue-400',
    route: '/pharmacy/reports/inventory', tag: 'مخزون',
  },
  {
    key: 'expiry', label: 'ذكاء الصلاحيات',
    desc: 'تتبع تواريخ الانتهاء وقيمة المخزون المهدد وخطط التصفية',
    icon: Clock, color: 'text-amber-600', leftBorder: 'border-l-amber-400',
    route: '/pharmacy/reports/expiry', tag: 'صلاحيات',
  },
  {
    key: 'financial', label: 'ذكاء الأرباح',
    desc: 'الإيرادات الصافية ونسبة الدفع نقداً مقابل البطاقة والمرتجعات',
    icon: DollarSign, color: 'text-teal-600', leftBorder: 'border-l-teal-500',
    route: '/pharmacy/reports/financial', tag: 'مالي',
  },
  {
    key: 'compliance', label: 'ذكاء الامتثال',
    desc: 'متابعة طلبات الشراء والموردين والطلبات المتأخرة',
    icon: ShieldCheck, color: 'text-slate-600', leftBorder: 'border-l-slate-400',
    route: '/pharmacy/reports/compliance', tag: 'موردون',
  },
  {
    key: 'operational', label: 'ذكاء التشغيل',
    desc: 'المنتجات الراكدة وكفاءة الموردين ورأس المال المجمد',
    icon: BarChart2, color: 'text-orange-600', leftBorder: 'border-l-orange-400',
    route: '/pharmacy/reports/operational', tag: 'تشغيل',
  },
]

const QUICK = [
  { label: 'مبيعات الأسبوع', route: '/pharmacy/reports/sales?dateRange=week&view=trend', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { label: 'مخزون منخفض',   route: '/pharmacy/reports/inventory?statFilter=lowStock&view=ranking', icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
  { label: 'صلاحية 30 يوم', route: '/pharmacy/reports/expiry?days=30&view=table', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
  { label: 'أرباح الشهر',   route: '/pharmacy/reports/financial?dateRange=month&view=summary', icon: DollarSign, color: 'text-violet-600', bg: 'bg-violet-50' },
]

export default function ReportsHubPage() {
  const [showAi, setShowAi] = useState(false)
  const { history, remove } = useReportHistory()

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-br from-teal-600 via-teal-700 to-teal-800 rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 70% 50%, white 0%, transparent 60%)' }} />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <BarChart2 size={20} className="text-teal-200" />
              <span className="text-teal-200 text-sm font-medium">Pulse — مركز التقارير</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              تقارير صيدليتك<br />
              <span className="text-teal-200">في مكان واحد</span>
            </h1>
            <p className="text-teal-100 text-sm mt-2 leading-relaxed max-w-md">
              اختر المجال الذي تريد تحليله — ستجد الأرقام مرتبة وواضحة مع توصيات قابلة للتطبيق فوراً.
            </p>
          </div>
          <button
            onClick={() => setShowAi(o => !o)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/20 hover:bg-white/30 border border-white/30 text-white text-sm font-semibold rounded-xl transition-colors backdrop-blur-sm shrink-0"
          >
            <Sparkles size={15} />
            المساعد الذكي
          </button>
        </div>
      </div>

      {/* Quick access */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap size={15} className="text-teal-500" />
          <h2 className="text-sm font-semibold text-gray-700">وصول سريع</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK.map(q => (
            <Link key={q.label} to={q.route}
              className="flex items-center gap-2.5 px-4 py-3 bg-white rounded-xl border border-gray-200 hover:border-teal-300 hover:shadow-sm transition-all group">
              <div className={`p-1.5 rounded-lg ${q.bg} shrink-0`}>
                <q.icon size={14} className={q.color} />
              </div>
              <span className="text-sm font-medium text-gray-800 group-hover:text-teal-700 transition-colors">{q.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Domain cards */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-700">مجالات التحليل</h2>
          <span className="text-xs text-gray-400">— اختر مجالاً للدخول إلى تقريره المفصّل</span>
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
