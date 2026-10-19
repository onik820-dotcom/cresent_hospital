import type { Role } from '@/lib/roles';

/**
 * One definition per report, shared by the screen, the Excel route and the
 * printed page.
 *
 * The alternative — a screen that builds its own table and an export that
 * builds another — is two implementations of the same report, and the first
 * time they disagree nobody can say which one the business should believe.
 * Here a column exists once: its heading in both languages, how it is
 * formatted, and how it totals.
 */

export type ColumnKind = 'text' | 'money' | 'litres' | 'number' | 'date' | 'datetime' | 'percent';

export interface ReportColumn {
  key: string;
  en: string;
  bn: string;
  kind: ColumnKind;
  /** Sum this column into a totals row. Only ever money, litres or a count. */
  total?: boolean;
  /** Hidden from anyone who may not see cost or profit. */
  costOnly?: boolean;
  width?: number;
}

export interface ReportDefinition {
  id: string;
  en: string;
  bn: string;
  /** One line under the title saying what the report is for. */
  descriptionEn: string;
  descriptionBn: string;
  roles: Role[];
  /** 'range' takes a from and a to; 'day' takes a single business day. */
  period: 'range' | 'day';
  columns: ReportColumn[];
  /** Rendered as its own page rather than a table — the Daily Sheet and P&L. */
  layout?: 'sheet' | 'statement' | 'shift';
}

const OWNER: Role[] = ['admin', 'md'];
const ALL: Role[] = ['manager', 'admin', 'md', 'accountant'];

export const REPORTS: ReportDefinition[] = [
  {
    id: 'daily-sheet',
    en: 'Daily Sheet',
    bn: 'দৈনিক বিবরণী',
    descriptionEn: 'The paper form, one business day, with its five signature lines.',
    descriptionBn: 'কাগজের ফরম — এক ব্যবসায়িক দিন, পাঁচটি স্বাক্ষরসহ।',
    roles: ALL,
    period: 'day',
    layout: 'sheet',
    columns: [],
  },
  {
    id: 'profit-loss',
    en: 'Profit & Loss',
    bn: 'লাভ-ক্ষতি',
    descriptionEn: 'Fuel and lubricant margin against the pump book, with the Chairman book shown separately below the operating result.',
    descriptionBn: 'জ্বালানি ও লুব্রিকেন্টের মুনাফা, পাম্পের খাতার খরচ বাদে। চেয়ারম্যানের খাতা আলাদা করে নিচে দেখানো।',
    roles: OWNER,
    period: 'range',
    layout: 'statement',
    columns: [],
  },
  {
    id: 'shift-closing-sheet',
    en: 'Shift closing sheet',
    bn: 'শিফট ক্লোজিং শিট',
    descriptionEn: 'Every closed shift: date, shift number, litres sold, rate, taka, cash, due and the manager who closed it.',
    descriptionBn: 'প্রতিটি বন্ধ শিফট — তারিখ, শিফট নং, বিক্রি লিটার, দর, টাকা, নগদ, বাকি ও ম্যানেজার।',
    roles: ALL,
    period: 'range',
    layout: 'shift',
    columns: [],
  },
  {
    id: 'shift-reconciliation',
    en: 'Shift reconciliation',
    bn: 'শিফট মিলকরণ',
    descriptionEn: 'Every close: litres, sales, the cash count and the variance with its reason.',
    descriptionBn: 'প্রতিটি শিফট বন্ধ — লিটার, বিক্রি, নগদ গণনা ও গরমিলের কারণ।',
    roles: ALL,
    period: 'range',
    columns: [
      { key: 'shift_date', en: 'Date', bn: 'তারিখ', kind: 'date', width: 14 },
      { key: 'shift_type', en: 'Shift', bn: 'শিফট', kind: 'text', width: 10 },
      { key: 'net_litres', en: 'Net litres', bn: 'নিট লিটার', kind: 'litres', total: true },
      { key: 'rate_per_litre', en: 'Rate', bn: 'দর', kind: 'money' },
      { key: 'sales_amount', en: 'Fuel sales', bn: 'জ্বালানি বিক্রি', kind: 'money', total: true },
      { key: 'lubricant_sales', en: 'Lubricant', bn: 'লুব্রিকেন্ট', kind: 'money', total: true },
      { key: 'credit_sales', en: 'Credit', bn: 'বাকি', kind: 'money', total: true },
      { key: 'cash_sales', en: 'Cash sales', bn: 'নগদ বিক্রি', kind: 'money', total: true },
      { key: 'dues_collected', en: 'Due collection', bn: 'বাকি আদায়', kind: 'money', total: true },
      { key: 'expenses_cash', en: 'Expenses', bn: 'খরচ', kind: 'money', total: true },
      { key: 'petty_in', en: 'Petty cash in', bn: 'পেটি ক্যাশ ইন', kind: 'money', total: true },
      { key: 'expected_cash', en: 'Expected cash', bn: 'থাকার কথা', kind: 'money', total: true },
      { key: 'counted_cash', en: 'Counted', bn: 'গোনা', kind: 'money', total: true },
      { key: 'cash_variance', en: 'Cash variance', bn: 'নগদ গরমিল', kind: 'money', total: true },
      { key: 'variance_reason', en: 'Reason', bn: 'কারণ', kind: 'text', width: 34 },
    ],
  },
  {
    id: 'stock-variance',
    en: 'Tank stock & variance register',
    bn: 'ট্যাংক মজুদ ও গরমিল রেজিস্টার',
    descriptionEn: 'The book against the rod, tank by tank, shift by shift.',
    descriptionBn: 'বই বনাম ডিপ — ট্যাংক ধরে, শিফট ধরে।',
    roles: ALL,
    period: 'range',
    columns: [
      { key: 'shift_date', en: 'Date', bn: 'তারিখ', kind: 'date', width: 14 },
      { key: 'shift_type', en: 'Shift', bn: 'শিফট', kind: 'text', width: 10 },
      { key: 'tank_code', en: 'Tank', bn: 'ট্যাংক', kind: 'text', width: 8 },
      { key: 'book_opening', en: 'Opening', bn: 'প্রারম্ভিক', kind: 'litres' },
      { key: 'refill_litres', en: 'Received', bn: 'গৃহীত', kind: 'litres', total: true },
      { key: 'returned_litres', en: 'Returned to purchased', bn: 'ক্রয়কৃত তেলে ফেরত', kind: 'litres', total: true },
      { key: 'sold_from_tank', en: 'Sold', bn: 'বিক্রি', kind: 'litres', total: true },
      { key: 'book_closing', en: 'Book closing', bn: 'বই অনুযায়ী', kind: 'litres' },
      { key: 'physical_closing', en: 'By the rod', bn: 'ডিপ অনুযায়ী', kind: 'litres' },
      { key: 'variance_litres', en: 'Variance', bn: 'গরমিল', kind: 'litres', total: true },
      { key: 'variance_pct', en: 'Variance %', bn: 'গরমিল %', kind: 'percent' },
      { key: 'variance_reason', en: 'Reason', bn: 'কারণ', kind: 'text', width: 34 },
    ],
  },
  {
    id: 'purchase-register',
    en: 'Purchase register',
    bn: 'ক্রয় রেজিস্টার',
    descriptionEn: 'Every oil purchase from the depot, with its value.',
    descriptionBn: 'ডিপো থেকে প্রতিটি তেল ক্রয় — মূল্যসহ।',
    roles: ALL,
    period: 'range',
    columns: [
      { key: 'arrived_at', en: 'Arrived', bn: 'আগমন', kind: 'datetime', width: 18 },
      { key: 'challan_no', en: 'Challan', bn: 'চালান', kind: 'text', width: 16 },
      { key: 'truck_reg', en: 'Truck', bn: 'ট্রাক', kind: 'text', width: 20 },
      { key: 'declared_litres', en: 'Declared', bn: 'ঘোষিত', kind: 'litres', total: true },
      { key: 'received_litres', en: 'Received', bn: 'গৃহীত', kind: 'litres', total: true },
      { key: 'shortage_litres', en: 'Shortage', bn: 'ঘাটতি', kind: 'litres', total: true },
      { key: 'depot_rate', en: 'Depot rate', bn: 'ডিপো দর', kind: 'money', costOnly: true },
      { key: 'value', en: 'Value', bn: 'মূল্য', kind: 'money', total: true, costOnly: true },
      { key: 'approved_by', en: 'Approved by', bn: 'অনুমোদনকারী', kind: 'text', width: 20 },
    ],
  },
  {
    id: 'oil-stock',
    en: 'Oil stock',
    bn: 'তেলের মজুদ',
    descriptionEn: 'Oil purchased, refilled into tanks and sold in the chosen period (Today / This month / This year), day by day, with total stock on the chosen date.',
    descriptionBn: 'নির্বাচিত সময়ের (আজ / এ মাস / এ বছর) দিনভিত্তিক তেল ক্রয়, ট্যাংক রিফিল ও বিক্রি — নির্বাচিত তারিখে মোট মজুদসহ।',
    roles: ALL,
    period: 'range',
    columns: [
      { key: 'item', en: 'Item', bn: 'বিবরণ', kind: 'text', width: 26 },
      { key: 'purchased', en: 'Purchased', bn: 'ক্রয়', kind: 'litres', total: true },
      { key: 'refilled', en: 'Refilled to tanks', bn: 'ট্যাংকে রিফিল', kind: 'litres', total: true },
      { key: 'returned', en: 'Returned from tanks', bn: 'ট্যাংক থেকে ফেরত', kind: 'litres', total: true },
      { key: 'sold', en: 'Sold', bn: 'বিক্রি', kind: 'litres', total: true },
      { key: 'stock', en: 'Stock in hand', bn: 'হাতে মজুদ', kind: 'litres', total: true },
    ],
  },
  {
    id: 'tank-refill-register',
    en: 'Tank refill register',
    bn: 'ট্যাংক রিফিল রেজিস্টার',
    descriptionEn: 'Purchased oil moved into Tank 1, 2 and 3, with dips and sales during refill.',
    descriptionBn: 'ক্রয়কৃত তেল ট্যাংক ১, ২, ৩-এ খালাস — ডিপ ও রিফিলের সময় বিক্রিসহ।',
    roles: ALL,
    period: 'range',
    columns: [
      { key: 'arrived_at', en: 'When', bn: 'কখন', kind: 'datetime', width: 18 },
      { key: 'tank_code', en: 'Tank', bn: 'ট্যাংক', kind: 'text', width: 8 },
      { key: 'dip_before_mm', en: 'Dip before (mm)', bn: 'আগের ডিপ (মিমি)', kind: 'number' },
      { key: 'dip_after_mm', en: 'Dip after (mm)', bn: 'পরের ডিপ (মিমি)', kind: 'number' },
      { key: 'litres_before', en: 'Before', bn: 'আগে', kind: 'litres' },
      { key: 'litres_after', en: 'After', bn: 'পরে', kind: 'litres' },
      { key: 'received_litres', en: 'Dip refill', bn: 'ডিপ রিফিল', kind: 'litres', total: true },
      { key: 'sold_litres', en: 'Sold during refill', bn: 'রিফিলের সময় বিক্রি', kind: 'litres', total: true },
      { key: 'total_refill', en: 'Total refill', bn: 'মোট রিফিল', kind: 'litres', total: true },
      { key: 'approved_by', en: 'Approved by', bn: 'অনুমোদনকারী', kind: 'text', width: 20 },
    ],
  },
  {
    id: 'sales-register',
    en: 'Due sales register',
    bn: 'বাকি বিক্রয় রেজিস্টার',
    descriptionEn: 'Credit sales party by party, with the vehicle and challan against each.',
    descriptionBn: 'বাকি বিক্রয় — পার্টি ধরে, গাড়ি ও চালানসহ।',
    roles: ALL,
    period: 'range',
    columns: [
      { key: 'sold_at', en: 'When', bn: 'কখন', kind: 'datetime', width: 18 },
      { key: 'party', en: 'Party', bn: 'পার্টি', kind: 'text', width: 30 },
      { key: 'vehicle_no', en: 'Vehicle', bn: 'গাড়ি', kind: 'text', width: 18 },
      { key: 'challan_no', en: 'Challan', bn: 'চালান', kind: 'text', width: 16 },
      { key: 'litres', en: 'Litres', bn: 'লিটার', kind: 'litres', total: true },
      { key: 'rate', en: 'Rate', bn: 'দর', kind: 'money' },
      { key: 'amount', en: 'Amount', bn: 'টাকা', kind: 'money', total: true },
      { key: 'over_limit', en: 'Past limit', bn: 'সীমার বাইরে', kind: 'text', width: 12 },
    ],
  },
  {
    id: 'customer-ageing',
    en: 'Customer ledger & ageing',
    bn: 'পার্টির খতিয়ান ও বয়সভিত্তিক বাকি',
    descriptionEn: 'What each party owes and how long they have owed it, oldest bill cleared first.',
    descriptionBn: 'কোন পার্টির কত বাকি ও কত দিনের — পুরনো বিল আগে পরিশোধ ধরে।',
    roles: ALL,
    period: 'day',
    columns: [
      { key: 'customer_name', en: 'Party', bn: 'পার্টি', kind: 'text', width: 30 },
      { key: 'credit_limit', en: 'Limit', bn: 'সীমা', kind: 'money' },
      { key: 'balance', en: 'Balance', bn: 'বাকি', kind: 'money', total: true },
      { key: 'bucket_0_30', en: '0–30', bn: '০–৩০', kind: 'money', total: true },
      { key: 'bucket_31_60', en: '31–60', bn: '৩১–৬০', kind: 'money', total: true },
      { key: 'bucket_61_90', en: '61–90', bn: '৬১–৯০', kind: 'money', total: true },
      { key: 'bucket_90_plus', en: '90+', bn: '৯০+', kind: 'money', total: true },
      { key: 'oldest_item_days', en: 'Oldest', bn: 'পুরনো', kind: 'number' },
    ],
  },
  {
    id: 'expense-register',
    en: 'Expense register',
    bn: 'খরচ রেজিস্টার',
    descriptionEn: 'Both books, head by head. The Chairman book is never added into the Pump book.',
    descriptionBn: 'দুই খাতা, খাত ধরে। চেয়ারম্যানের খাতা কখনো পাম্পের খাতায় যোগ হয় না।',
    roles: ALL,
    period: 'range',
    columns: [
      { key: 'spent_at', en: 'When', bn: 'কখন', kind: 'datetime', width: 18 },
      { key: 'book', en: 'Book', bn: 'খাতা', kind: 'text', width: 14 },
      { key: 'head', en: 'Head', bn: 'খাত', kind: 'text', width: 26 },
      { key: 'description', en: 'For', bn: 'বাবদ', kind: 'text', width: 30 },
      { key: 'paid_by', en: 'Paid by', bn: 'যেভাবে', kind: 'text', width: 12 },
      { key: 'amount', en: 'Amount', bn: 'টাকা', kind: 'money', total: true },
    ],
  },
  {
    id: 'cash-book',
    en: 'Cash book',
    bn: 'নগদ খাতা',
    descriptionEn: 'The drawer shift by shift: opening, sales, collections, expenses, deposits, count.',
    descriptionBn: 'শিফট ধরে নগদ — প্রারম্ভিক, বিক্রি, আদায়, খরচ, জমা, গণনা।',
    roles: ALL,
    period: 'range',
    columns: [
      { key: 'shift_date', en: 'Date', bn: 'তারিখ', kind: 'date', width: 14 },
      { key: 'shift_type', en: 'Shift', bn: 'শিফট', kind: 'text', width: 10 },
      { key: 'cash_sales', en: 'Cash sales', bn: 'নগদ বিক্রি', kind: 'money', total: true },
      { key: 'dues_collected', en: 'Collected', bn: 'আদায়', kind: 'money', total: true },
      { key: 'expenses_cash', en: 'Expenses', bn: 'খরচ', kind: 'money', total: true },
      { key: 'petty_in', en: 'Petty cash in', bn: 'পেটি ক্যাশ ইন', kind: 'money', total: true },
      { key: 'expected_cash', en: 'Expected', bn: 'থাকার কথা', kind: 'money' },
      { key: 'counted_cash', en: 'Counted', bn: 'গোনা', kind: 'money' },
      { key: 'cash_variance', en: 'Variance', bn: 'গরমিল', kind: 'money', total: true },
      { key: 'bank_deposits', en: 'Deposited', bn: 'ব্যাংকে জমা', kind: 'money', total: true },
      { key: 'balance', en: 'Balance in drawer', bn: 'ড্রয়ারে ব্যালেন্স', kind: 'money', total: true },
    ],
  },
  {
    id: 'dispenser-performance',
    en: 'Dispenser performance',
    bn: 'মেশিনভিত্তিক বিক্রি',
    descriptionEn: 'Every shift, nozzle by nozzle: meter readings, litres and test.',
    descriptionBn: 'প্রতিটি নজলের লিটার ও টেস্টে যাওয়া পরিমাণ।',
    roles: ALL,
    period: 'range',
    columns: [
      { key: 'shift_date', en: 'Date', bn: 'তারিখ', kind: 'date', width: 14 },
      { key: 'shift_type', en: 'Shift', bn: 'শিফট', kind: 'text', width: 10 },
      { key: 'dispenser_code', en: 'Machine', bn: 'মেশিন', kind: 'text', width: 10 },
      { key: 'nozzle_no', en: 'Nozzle', bn: 'নজল', kind: 'number', width: 8 },
      { key: 'tank_code', en: 'Tank', bn: 'ট্যাংক', kind: 'text', width: 8 },
      { key: 'opening', en: 'Opening meter', bn: 'শুরুর মিটার', kind: 'text' },
      { key: 'closing', en: 'Closing meter', bn: 'শেষের মিটার', kind: 'text' },
      { key: 'litres', en: 'Litres', bn: 'লিটার', kind: 'litres', total: true },
      { key: 'test_litres', en: 'Test', bn: 'টেস্ট', kind: 'litres', total: true },
      { key: 'rollovers', en: 'Rollovers', bn: 'রোলওভার', kind: 'number', total: true },
    ],
  },
  {
    id: 'lubricant-movement',
    en: 'Lubricant movement',
    bn: 'লুব্রিকেন্ট লেনদেন',
    descriptionEn: 'Lubricant stock on hand and sales, each in the product’s own unit.',
    descriptionBn: 'লুব্রিকেন্ট মজুদ ও বিক্রয়, প্রতিটি পণ্যের নিজস্ব এককে।',
    roles: ALL,
    period: 'range',
    columns: [
      { key: 'txn_at', en: 'When', bn: 'কখন', kind: 'datetime', width: 18 },
      { key: 'sku', en: 'Product', bn: 'পণ্য', kind: 'text', width: 26 },
      { key: 'txn_type', en: 'Movement', bn: 'ধরন', kind: 'text', width: 12 },
      { key: 'qty', en: 'Quantity', bn: 'পরিমাণ', kind: 'text', width: 14 },
      { key: 'rate', en: 'Rate', bn: 'দর', kind: 'money' },
      { key: 'amount', en: 'Value', bn: 'মূল্য', kind: 'money', total: true },
      { key: 'party', en: 'Party / vehicle', bn: 'পার্টি / গাড়ি', kind: 'text', width: 24 },
    ],
  },
  {
    id: 'dip-register',
    en: 'Dip register',
    bn: 'ডিপ রেজিস্টার',
    descriptionEn: 'Every rod reading — shift close and both sides of a refill — with the litres it converted to.',
    descriptionBn: 'প্রতিটি ডিপ — শিফট শেষ এবং রিফিলের আগে ও পরে — সঙ্গে রূপান্তরিত লিটার।',
    roles: ALL,
    period: 'range',
    columns: [
      { key: 'recorded_at', en: 'When', bn: 'কখন', kind: 'datetime', width: 18 },
      { key: 'tank_code', en: 'Tank', bn: 'ট্যাংক', kind: 'text', width: 8 },
      { key: 'dip_type', en: 'Reading', bn: 'ধরন', kind: 'text', width: 18 },
      { key: 'dip_mm', en: 'Dip (mm)', bn: 'ডিপ (মিমি)', kind: 'number' },
      { key: 'litres', en: 'Litres', bn: 'লিটার', kind: 'litres' },
      { key: 'recorded_by', en: 'Who', bn: 'কে', kind: 'text', width: 22 },
    ],
  },

  {
    id: 'audit-log',
    en: 'Audit log',
    bn: 'অডিট লগ',
    descriptionEn: 'Every change to a financial record, with who made it and what it was before.',
    descriptionBn: 'প্রতিটি হিসাব পরিবর্তন — কে করেছে এবং আগে কী ছিল।',
    roles: ['admin'],
    period: 'range',
    columns: [
      { key: 'at', en: 'When', bn: 'কখন', kind: 'datetime', width: 20 },
      { key: 'actor', en: 'Who', bn: 'কে', kind: 'text', width: 22 },
      { key: 'actor_role', en: 'Role', bn: 'ভূমিকা', kind: 'text', width: 12 },
      { key: 'table_name', en: 'Record', bn: 'রেকর্ড', kind: 'text', width: 22 },
      { key: 'action', en: 'Action', bn: 'কাজ', kind: 'text', width: 12 },
      { key: 'summary', en: 'What changed', bn: 'কী বদলেছে', kind: 'text', width: 48 },
    ],
  },
];

export function reportById(id: string): ReportDefinition | undefined {
  return REPORTS.find((r) => r.id === id);
}

export function reportsForRole(role: Role): ReportDefinition[] {
  return REPORTS.filter((r) => r.roles.includes(role));
}

/** Columns this role may actually see, with cost stripped for a manager. */
export function visibleColumns(report: ReportDefinition, canSeeCost: boolean): ReportColumn[] {
  return report.columns.filter((c) => canSeeCost || !c.costOnly);
}
