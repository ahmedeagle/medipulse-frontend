import type { PurchaseInvoice } from '../../../api/purchases.api';

const STATUS_AR: Record<string, string> = {
  draft: 'مسودة', received: 'مستلمة', paid: 'مدفوعة', cancelled: 'ملغاة',
};
const PAYMENT_AR: Record<string, string> = { pending: 'معلق', paid: 'مدفوع' };
const METHOD_AR: Record<string, string> = {
  cash: 'نقدي', credit_card: 'بطاقة ائتمان', bank_transfer: 'تحويل بنكي', credit_term: 'أجل',
};

const fmtMoney = (n: number | string) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

export function buildInvoicePrintHtml(inv: PurchaseInvoice): string {
  const lineRows = (inv.lines ?? []).map((l, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${l.productName}</td>
      <td>${l.productSku ?? '—'}</td>
      <td>${l.batchNumber ?? '—'}</td>
      <td>${fmtDate(l.expiryDate)}</td>
      <td>${l.purchaseQty}</td>
      <td>${l.freeGoodsQty || '—'}</td>
      <td>${fmtMoney(l.purchasePrice)}</td>
      <td>${l.discountPct ? l.discountPct + '%' : '—'}</td>
      <td>${l.taxPct ? l.taxPct + '%' : '—'}</td>
      <td class="total">${fmtMoney(l.lineTotal)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>فاتورة شراء — ${inv.poNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 13px; color: #1a1a1a; direction: rtl; padding: 24px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #059669; }
  .brand { font-size: 20px; font-weight: 700; color: #059669; }
  .brand-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .po-badge { text-align: left; }
  .po-number { font-size: 22px; font-weight: 800; color: #1a1a1a; }
  .po-label { font-size: 11px; color: #6b7280; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .meta-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
  .meta-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .meta-value { font-size: 14px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
  th { background: #d1fae5; color: #065f46; font-weight: 700; padding: 8px 6px; text-align: right; border: 1px solid #a7f3d0; font-size: 11px; }
  td { padding: 7px 6px; border: 1px solid #e5e7eb; vertical-align: middle; }
  tr:nth-child(even) td { background: #f9fafb; }
  td.total { font-weight: 700; }
  .totals { margin-right: auto; margin-left: 0; width: 280px; }
  .totals table { margin-bottom: 0; }
  .totals td { border: none; padding: 5px 8px; }
  .totals td:first-child { color: #6b7280; }
  .totals td:last-child { font-weight: 600; text-align: left; direction: ltr; }
  .grand-total td { font-size: 16px; font-weight: 800; color: #059669; border-top: 2px solid #059669 !important; padding-top: 8px; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .status-draft    { background: #f3f4f6; color: #374151; }
  .status-received { background: #d1fae5; color: #065f46; }
  .status-paid     { background: #d1fae5; color: #065f46; }
  .status-cancelled{ background: #fee2e2; color: #991b1b; }
  .notes { margin-top: 16px; padding: 10px 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; font-size: 12px; color: #78350f; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 10px; color: #9ca3af; }
  @media print {
    body { padding: 0; }
    @page { margin: 12mm; size: A4 landscape; }
  }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="brand">إدارة المشتريات</div>
    <div class="brand-sub">Bnoov — نظام إدارة الصيدليات</div>
  </div>
  <div class="po-badge">
    <div class="po-number">${inv.poNumber}</div>
    <div class="po-label">رقم أمر الشراء</div>
  </div>
</div>

<div class="meta">
  <div class="meta-box">
    <div class="meta-label">المورد</div>
    <div class="meta-value">${inv.supplierName}</div>
    ${inv.supplierInvoiceNumber ? `<div style="font-size:11px;color:#6b7280;margin-top:4px">رقم فاتورة المورد: ${inv.supplierInvoiceNumber}</div>` : ''}
  </div>
  <div class="meta-box">
    <div class="meta-label">التاريخ</div>
    <div class="meta-value">${fmtDate(inv.invoiceDate ?? inv.createdAt)}</div>
  </div>
  <div class="meta-box">
    <div class="meta-label">الحالة</div>
    <div class="meta-value">
      <span class="status-badge status-${inv.status}">${STATUS_AR[inv.status] ?? inv.status}</span>
      &nbsp;
      <span class="status-badge status-${inv.paymentStatus === 'paid' ? 'paid' : 'draft'}">${PAYMENT_AR[inv.paymentStatus] ?? inv.paymentStatus}</span>
    </div>
  </div>
  <div class="meta-box">
    <div class="meta-label">طريقة الدفع</div>
    <div class="meta-value">${METHOD_AR[inv.paymentMethod] ?? inv.paymentMethod}</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>#</th>
      <th>اسم المنتج</th>
      <th>الرمز</th>
      <th>رقم الدفعة</th>
      <th>تاريخ الانتهاء</th>
      <th>الكمية</th>
      <th>مجاني</th>
      <th>سعر الشراء</th>
      <th>خصم</th>
      <th>ضريبة</th>
      <th>الإجمالي</th>
    </tr>
  </thead>
  <tbody>
    ${lineRows}
  </tbody>
</table>

<div class="totals">
  <table>
    <tr><td>المجموع الفرعي</td><td>${fmtMoney(inv.subtotal)} ر.س</td></tr>
    <tr><td>إجمالي الخصم</td><td>${fmtMoney(inv.totalDiscount)} ر.س</td></tr>
    <tr><td>ضريبة القيمة المضافة</td><td>${fmtMoney(inv.totalTax)} ر.س</td></tr>
    <tr class="grand-total"><td>الإجمالي النهائي</td><td>${fmtMoney(inv.grandTotal)} ر.س</td></tr>
  </table>
</div>

${inv.notes ? `<div class="notes"><strong>ملاحظات:</strong> ${inv.notes}</div>` : ''}

<div class="footer">
  تم إنشاء هذه الفاتورة بواسطة نظام Bnoov — ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
</div>

<script>
  window.onload = function() {
    window.print();
    window.onafterprint = function() { window.close(); };
  };
</script>
</body>
</html>`;
}
