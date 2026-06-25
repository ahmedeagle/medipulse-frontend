// ─── Field label map ────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  // Purchase / return fields
  purchasePrice:         'سعر الشراء',
  returnPrice:           'سعر الإرجاع',
  salePrice:             'سعر البيع',
  purchaseQty:           'الكمية',
  returnQty:             'كمية الإرجاع',
  freeGoodsQty:          'الكمية المجانية',
  availableQty:          'الكمية المتاحة',
  discountPct:           'نسبة الخصم',
  discountValue:         'قيمة الخصم',
  discountType:          'نوع الخصم',
  taxPct:                'نسبة الضريبة',
  productId:             'المنتج',
  productName:           'اسم المنتج',
  productSku:            'رمز المنتج',
  batchNumber:           'رقم الدفعة',
  expiryDate:            'تاريخ الانتهاء',
  supplierName:          'اسم المورد',
  supplierTenantId:      'المورد',
  supplierInvoiceNumber: 'رقم فاتورة المورد',
  supplierInvoiceDate:   'تاريخ فاتورة المورد',
  invoiceDate:           'تاريخ الفاتورة',
  paymentMethod:         'طريقة الدفع',
  notes:                 'الملاحظات',
  lines:                 'الأصناف',
  sortOrder:             'الترتيب',
  // Common fields
  email:                 'البريد الإلكتروني',
  password:              'كلمة المرور',
  name:                  'الاسم',
  phone:                 'رقم الهاتف',
  firstName:             'الاسم الأول',
  lastName:              'اسم العائلة',
  // Inventory
  minThreshold:          'حد المخزون الأدنى',
  maxThreshold:          'حد المخزون الأقصى',
  quantity:              'الكمية',
  price:                 'السعر',
  costPrice:             'سعر التكلفة',
  // Pagination
  page:                  'الصفحة',
  limit:                 'عدد السجلات',
}

// ─── Rule translation ────────────────────────────────────────────────────────────

function translateRule(rule: string): string {
  let m: RegExpMatchArray | null

  if ((m = rule.match(/must not be less than ([\d.]+)/)))          return `يجب ألا يقل عن ${m[1]}`
  if ((m = rule.match(/must not be greater than ([\d.]+)/)))       return `يجب ألا يزيد عن ${m[1]}`
  if ((m = rule.match(/must be less than or equal to ([\d.]+)/)))  return `يجب ألا يزيد عن ${m[1]}`
  if ((m = rule.match(/must be greater than or equal to ([\d.]+)/))) return `يجب ألا يقل عن ${m[1]}`
  if (rule.includes('must be a number'))                           return 'يجب أن يكون رقماً'
  if (rule.includes('must not be empty'))                          return 'هذا الحقل مطلوب'
  if (rule.includes('must be a string'))                           return 'يجب أن يكون نصاً'
  if (rule.includes('must be an UUID') || rule.includes('must be a UUID')) return 'معرّف غير صالح'
  if (rule.includes('must be a valid ISO 8601 date'))              return 'تاريخ غير صالح'
  if (rule.includes('must be a boolean'))                          return 'يجب أن يكون قيمة منطقية'
  if (rule.includes('must be one of the following values'))        return 'قيمة غير مقبولة'
  if (rule.includes('must be an array'))                           return 'يجب أن يكون قائمة'
  if (rule.includes('must be an email'))                           return 'بريد إلكتروني غير صالح'
  if (rule.includes('must be longer than or equal to'))            return 'النص قصير جداً'
  if (rule.includes('must be shorter than or equal to'))           return 'النص طويل جداً'
  if (rule.includes('is not valid'))                               return 'قيمة غير صالحة'
  return rule
}

// ─── Field path → Arabic label ───────────────────────────────────────────────────

function translatePath(path: string): string {
  const parts = path.split('.')
  const labels: string[] = []
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      labels.push(`السطر ${+part + 1}`)
    } else {
      labels.push(FIELD_LABELS[part] ?? part)
    }
  }
  return labels.join(' ← ')
}

// ─── Public API ──────────────────────────────────────────────────────────────────

/**
 * Translates a single class-validator error string to Arabic.
 * Format: "path.to.field rule message here"
 */
export function translateApiError(msg: string): string {
  const spaceIdx = msg.indexOf(' ')
  if (spaceIdx === -1) return msg

  const fieldPath = msg.slice(0, spaceIdx)
  const rule      = msg.slice(spaceIdx + 1)

  // Only translate when fieldPath looks like a dotted property path (no spaces)
  if (/^[a-zA-Z0-9._]+$/.test(fieldPath)) {
    return `${translatePath(fieldPath)}: ${translateRule(rule)}`
  }
  return msg
}

/**
 * Extracts and translates all error messages from an Axios error response.
 * Works for NestJS class-validator 400s (message is string[]) and single-message errors.
 */
export function getApiErrors(err: unknown): string[] {
  const msg = (err as any)?.response?.data?.message
  if (Array.isArray(msg) && msg.length) return msg.map(translateApiError)
  if (typeof msg === 'string' && msg)    return [translateApiError(msg)]
  return ['حدث خطأ. يرجى المحاولة مجدداً.']
}
