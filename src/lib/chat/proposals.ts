/**
 * Everything the assistant can *propose*.
 *
 * The assistant never writes. It describes a write, the person taps the card,
 * and the write then goes through the ordinary action with the ordinary RLS,
 * triggers and audit row. This module holds the shapes both sides agree on.
 */

export type ProposalKind =
  | 'expense.create'
  | 'credit_sale.create'
  | 'payment.receive'
  | 'party.save'
  | 'balance.adjust'
  | 'lub.movement'
  | 'lub.rates'
  | 'equipment.status'
  | 'shift.open'
  | 'shift.close'
  | 'record.void'
  | 'record.edit';

export interface Proposal {
  kind: ProposalKind;
  summary: { en: string; bn: string };
  fields: Array<{ label: { en: string; bn: string }; value: string }>;
  payload: Record<string, string | number | boolean | null>;
}

/** Tables the assistant may edit or void a single row in. */
export const EDITABLE_TABLES = [
  'expenses',
  'credit_sales',
  'payments',
  'lub_transactions',
] as const;
export type EditableTable = (typeof EDITABLE_TABLES)[number];

export const TABLE_LABEL: Record<EditableTable, { en: string; bn: string }> = {
  expenses: { en: 'Expense', bn: 'খরচ' },
  credit_sales: { en: 'Credit sale', bn: 'বাকি বিক্রি' },
  payments: { en: 'Payment', bn: 'জমা' },
  lub_transactions: { en: 'Lubricant movement', bn: 'মবিল লেনদেন' },
};

export function field(en: string, bn: string, value: unknown) {
  return { label: { en, bn }, value: value === undefined || value === null ? '' : String(value) };
}
