import type { PosShift } from '../api/pos.api'

interface ShiftPrintOpts {
  currency?: string
  pharmName?: string
  address?: string
  phone?: string
  /** Override closing balance (PosPage supplies the typed value before the API call saves it) */
  closingBalance?: number
  /** Override close note */
  closeNote?: string
}

export function printShiftSummary(shift: PosShift, opts: ShiftPrintOpts = {}) {
  const currency  = opts.currency  ?? 'EGP'
  const pharmName = opts.pharmName ?? 'الصيدلية'
  const closing   = opts.closingBalance ?? Number(shift.closingBalance ?? 0)
  const note      = opts.closeNote     ?? shift.closeNote ?? ''

  const f = (n: number | null | undefined) =>
    `${currency} ${Number(n ?? 0).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const expected =
    Number(shift.openingBalance)    +
    Number(shift.totalCashSales)    +
    Number(shift.totalCashIn  ?? 0) -
    Number(shift.totalCashOut ?? 0)

  const variance = closing - expected
  const net      = Number(shift.totalSales) - Number(shift.totalReturns)

  // Duration
  const openMs  = new Date(shift.openedAt).getTime()
  const closeMs = shift.closedAt ? new Date(shift.closedAt).getTime() : Date.now()
  const totalMin = Math.floor((closeMs - openMs) / 60000)
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  const durParts: string[] = []
  if (d > 0) durParts.push(`${d} يوم`)
  if (h > 0) durParts.push(`${h} ساعة`)
  if (m > 0 || durParts.length === 0) durParts.push(`${m} دقيقة`)
  const durStr = durParts.join('? ')

  const openDate = new Date(shift.openedAt)
  const dateStr  = openDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr  = openDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  const now      = new Date()
  const printedAt = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) +
                    ' ?? ' + now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })

  const shiftLabel = `Shift-${shift.id.slice(0, 6).toUpperCase()}`
  const varRowClass = variance < -10 ? 'mismatch' : variance > 10 ? 'over' : ''

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>ملخص إغلاق الشفت</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:32px;max-width:580px;margin:0 auto;direction:rtl}
.center{text-align:center}
.pharm-name{font-size:22px;font-weight:900;margin-bottom:3px}
.pharm-sub{font-size:11px;color:#666;margin-bottom:2px}
.doc-title{font-size:17px;font-weight:800;margin:14px 0 2px}
.shift-id{font-size:12px;color:#555;margin-bottom:16px}
.divider{border-top:2.5px solid #222;margin-bottom:14px}
.meta-grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #ddd;border-radius:6px;overflow:hidden;margin-bottom:12px}
.meta-cell{padding:10px 12px}
.meta-cell:first-child{border-left:1px solid #ddd}
.meta-label{font-size:10px;color:#888;font-weight:600;margin-bottom:3px}
.meta-value{font-size:14px;font-weight:700}
.meta-sub{font-size:10px;color:#999;margin-top:1px}
.dur-box{background:#f5f5f5;border-radius:6px;padding:9px 12px;margin-bottom:14px}
.dur-label{font-size:10px;color:#888;font-weight:600;margin-bottom:2px}
.dur-value{font-size:13px;font-weight:600}
.section{margin-bottom:16px}
.sec-title{text-align:center;font-size:13px;font-weight:700;padding:6px 0;border-top:1px solid #bbb;border-bottom:1px solid #bbb;margin-bottom:8px}
.row{display:flex;justify-content:space-between;align-items:center;padding:5px 2px;border-bottom:1px solid #f0f0f0;font-size:12px}
.row:last-child{border-bottom:none}
.lbl{color:#555}.val{font-weight:600;font-family:monospace}
.net-row{display:flex;justify-content:space-between;background:#111;color:#fff;border-radius:4px;padding:8px 10px;margin-top:6px;font-size:14px;font-weight:900}
.mismatch .val{color:#dc2626;font-weight:700}
.over .val{color:#d97706;font-weight:700}
.notes-box{border:1px solid #e5e7eb;border-radius:6px;padding:8px 12px;min-height:36px;font-size:11px;color:#444;line-height:1.5}
.footer{text-align:center;margin-top:22px;padding-top:14px;border-top:2px dashed #ccc;color:#777;font-size:10px;line-height:1.9}
.footer strong{color:#6D28D9;font-size:11px}
@media print{body{padding:20px}}
</style>
</head>
<body>
<div class="center">
  <div class="pharm-name">${pharmName}</div>
  ${opts.address ? `<div class="pharm-sub">${opts.address}</div>` : ''}
  ${opts.phone   ? `<div class="pharm-sub">هاتف: ${opts.phone}</div>` : ''}
  <div class="doc-title">ملخص إغلاق الشفت</div>
  <div class="shift-id">الشفت ${shiftLabel}</div>
</div>

<div class="divider"></div>

<div class="meta-grid">
  <div class="meta-cell">
    <div class="meta-label">الكاشير</div>
    <div class="meta-value">${shift.cashierName ?? 'كاشير'}</div>
    <div class="meta-sub">Cashier</div>
  </div>
  <div class="meta-cell">
    <div class="meta-label">التاريخ والوقت</div>
    <div class="meta-value">${dateStr}</div>
    <div class="meta-sub">${timeStr}</div>
  </div>
</div>

<div class="dur-box">
  <div class="dur-label">فترة الشفت</div>
  <div class="dur-value">${durStr}</div>
</div>

<div class="section">
  <div class="sec-title">ملخص الشفت</div>
  <div class="row"><span class="lbl">ملخص البيعة</span><span class="val">${shift.transactionCount}</span></div>
  <div class="row"><span class="lbl">إجمالي المبيعات</span><span class="val">${f(shift.totalSales)}</span></div>
  <div class="row"><span class="lbl">الاسترادات</span><span class="val">${f(shift.totalReturns)}</span></div>
  <div class="net-row"><span>صافي المبيعات</span><span>${f(net)}</span></div>
</div>

<div class="section">
  <div class="sec-title">ملخص الشفت</div>
  <div class="row"><span class="lbl">المدفوعات النقدية</span><span class="val">${f(shift.totalCashSales)}</span></div>
  <div class="row"><span class="lbl">بطاقة ائتمان</span><span class="val">${f(shift.totalCardSales)}</span></div>
  <div class="row"><span class="lbl">محفظة رقمية</span><span class="val">${f(0)}</span></div>
</div>

<div class="section">
  <div class="sec-title">ملخص الشفت</div>
  <div class="row"><span class="lbl">النقدية المتوقعة</span><span class="val">${f(expected)}</span></div>
  <div class="row"><span class="lbl">النقدية الفعلية المحسوبة</span><span class="val">${f(closing)}</span></div>
  <div class="row ${varRowClass}"><span class="lbl">الفرق</span><span class="val">${f(variance)}</span></div>
</div>

<div class="section">
  <div class="sec-title">ملاحظات</div>
  <div class="notes-box">${note}</div>
</div>

<div class="footer">
  <div>طُبع في: ${printedAt}</div>
  <div>أغلق الشفت بواسطة: <strong>${shift.cashierName ?? 'كاشير'}</strong></div>
  <div>شكرًا لاستخدامك نظام نقطة البيع</div>
  <strong>${pharmName}</strong>
</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=640,height=860')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 400)
}

