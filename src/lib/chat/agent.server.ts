import type { SupabaseClient } from '@supabase/supabase-js';
import { createOpenAI } from '@ai-sdk/openai';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import { runTool, systemPrompt, type ToolContext } from '@/lib/chat/tools';
import {
  EDITABLE_TABLES,
  TABLE_LABEL,
  field,
  type EditableTable,
  type Proposal,
} from '@/lib/chat/proposals';
import type { Role } from '@/lib/roles';
import { createLovableAiGatewayRunIdFetch } from '@/lib/ai-gateway.server';

/**
 * One chat turn.
 *
 * Reads run on the caller's own Supabase client, so Row Level Security answers
 * exactly as it would if the person had opened the screen. Writes do not happen
 * here at all: the write tools return a proposal, and a proposal is a card the
 * person has to tap.
 */

type Lang = 'bn' | 'en';

interface TurnInput {
  supabase: SupabaseClient;
  userId: string;
  role: Role;
  fullName: string;
  sessionId: string;
  message: string;
  lang: Lang;
}

const WRITE_ROLES: Role[] = ['manager', 'admin'];

export async function runChatTurn(input: TurnInput): Promise<{
  reply: string;
  proposal: Proposal | null;
}> {
  const { supabase, userId, role, fullName, sessionId, message, lang } = input;
  const ctx: ToolContext = { supabase, role, lang };

  // The question is kept whether or not the answer works. A conversation with
  // the gaps removed is one nobody can audit.
  await supabase
    .from('chat_messages')
    .insert({ session_id: sessionId, user_id: userId, role: 'user', content: message, content_lang: lang } as never);

  const { data: history } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(14);

  const prior = ((history ?? []) as Array<{ role: string; content: string }>)
    .reverse()
    .map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    }));

  let proposal: Proposal | null = null;

  const canWrite = WRITE_ROLES.includes(role);
  const refuseWrite = () => ({
    ok: false,
    refused:
      role === 'md'
        ? 'The MD account is read-only. Nothing can be written from it; report the figure instead.'
        : 'This role may not record, edit or remove entries.',
  });

  const prepared = (p: Proposal) => {
    proposal = p;
    return {
      ok: true,
      prepared: true,
      note: 'A confirmation card is now on screen. Nothing is saved until the person taps it.',
      summary: p.summary,
    };
  };

  const read = (name: string) => async (args: Record<string, unknown>) =>
    (await runTool(name, args ?? {}, ctx)) as unknown;

  const { REPORTS, reportsForRole, visibleColumns } = await import('@/lib/reports/registry');
  const { runReport } = await import('@/lib/reports/run');
  const allowedReports = reportsForRole(role);
  const canSeeCost = role === 'admin' || role === 'md';

  const tools = {
    // ---- every report in the app ------------------------------------------
    list_reports: tool({
      description:
        'Every report this person may open on the Reports page, with id, name and what it covers. Use it to pick the right report for any question about sales, stock, oil purchases, tank refills, dips, dues, cash book, expenses, lubricants, dispensers, shifts, variance, profit or audit.',
      inputSchema: z.object({}),
      execute: async () => ({
        reports: allowedReports.map((r) => ({
          id: r.id,
          en: r.en,
          bn: r.bn,
          period: r.period,
          about: r.descriptionEn,
        })),
      }),
    }),
    run_report: tool({
      description:
        'Run any report from the Reports page for a date range (YYYY-MM-DD, business days) and get its rows, totals and sections — the exact figures the screen shows. Use this to answer and to calculate anything asked. For day-period reports, only `to` is used.',
      inputSchema: z.object({
        report_id: z.enum(REPORTS.map((r) => r.id) as [string, ...string[]]),
        from: z.string(),
        to: z.string(),
      }),
      execute: async (args) => {
        const def = allowedReports.find((r) => r.id === args.report_id);
        if (!def) return { ok: false, refused: 'This role may not open that report.' };
        try {
          const res = await runReport(def.id, args.from, args.to, canSeeCost, supabase);
          const cap = 250;
          return {
            ok: !res.error,
            error: res.error ?? null,
            report: def.en,
            from: res.from,
            to: res.to,
            columns: visibleColumns(def, canSeeCost).map((c) => ({ key: c.key, en: c.en, kind: c.kind })),
            row_count: res.rows.length,
            rows: res.rows.slice(0, cap),
            truncated: res.rows.length > cap,
            totals: res.totals,
            sections: res.sections?.map((s) => ({ en: s.en, rows: s.rows.slice(0, cap), totals: s.totals })) ?? null,
            sheet: res.sheet ?? null,
            statement: res.statement ?? null,
          };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),
    calculate: tool({
      description:
        'Exact arithmetic on figures you already fetched. Give an expression using numbers, + - * / ( ) only, e.g. "(1200.5 - 300) * 130.14". Always use this instead of mental maths for totals, differences, averages and percentages.',
      inputSchema: z.object({ expression: z.string().max(500) }),
      execute: async ({ expression }) => {
        const clean = expression.replace(/,/g, '');
        if (!/^[\d\s+\-*/().]+$/.test(clean)) return { ok: false, error: 'Only numbers and + - * / ( ) are allowed.' };
        try {
          const value = Function(`"use strict";return (${clean});`)() as number;
          if (!Number.isFinite(value)) return { ok: false, error: 'Result is not a finite number.' };
          return { ok: true, value: Math.round(value * 1e6) / 1e6 };
        } catch {
          return { ok: false, error: 'Could not parse the expression.' };
        }
      },
    }),
    // ---- reading ---------------------------------------------------------
    get_kpis: tool({
      description:
        'Headline figures: sales and litres today and month to date, cash in the drawer, dues outstanding, days of cover, open variances, and profit for the owner and MD only.',
      inputSchema: z.object({}),
      execute: read('get_kpis'),
    }),
    find_customer: tool({
      description:
        'Find a credit party by name, Bangla name or vehicle number. Returns balance, credit limit and the age of the oldest unpaid bill.',
      inputSchema: z.object({ query: z.string() }),
      execute: read('find_customer'),
    }),
    get_tanks: tool({
      description: 'Stock in each tank: last dip in mm, litres from the certified chart, and the latest variance.',
      inputSchema: z.object({}),
      execute: read('get_tanks'),
    }),
    get_shifts: tool({
      description: 'The open shift if there is one, plus recent closed shifts with litres, sales, cash counted and variance.',
      inputSchema: z.object({ recent: z.number().int().nullable() }),
      execute: read('get_shifts'),
    }),
    get_profit: tool({
      description: 'Profit and loss over a range of business days. Owner and MD only; anyone else gets a refusal you must relay plainly.',
      inputSchema: z.object({ from: z.string(), to: z.string() }),
      execute: read('get_profit'),
    }),
    get_daily_sheet: tool({
      description: 'Everything recorded on one business day: meters, tank movement, sales, party credit, lubricants, expenses and cash.',
      inputSchema: z.object({ date: z.string() }),
      execute: read('get_daily_sheet'),
    }),
    list_expense_heads: tool({
      description: 'The expense heads money can be booked against. Call before proposing an expense.',
      inputSchema: z.object({}),
      execute: read('list_expense_heads'),
    }),
    list_lub_products: tool({
      description: 'Lubricant products (SKUs) with their current purchase and sale rates and stock on the shelf.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('lub_skus')
          .select('id, name, name_bn, pack_size, current_purchase_rate, current_sale_rate, reorder_level')
          .order('name');
        return error ? { ok: false, error: error.message } : { ok: true, data };
      },
    }),
    list_equipment: tool({
      description: 'Tanks and dispensers with their codes and status, so equipment can be referred to by id.',
      inputSchema: z.object({}),
      execute: async () => {
        const [tanks, dispensers] = await Promise.all([
          supabase.from('tanks').select('id, code, status, fuel_type'),
          supabase.from('dispensers').select('id, code, status'),
        ]);
        return { ok: true, data: { tanks: tanks.data ?? [], dispensers: dispensers.data ?? [] } };
      },
    }),
    list_recent_entries: tool({
      description:
        'The most recent entries in one book, newest first, with their ids. Use this to find the exact row before proposing an edit or a removal.',
      inputSchema: z.object({
        table: z.enum(EDITABLE_TABLES),
        limit: z.number().int().nullable(),
      }),
      execute: async ({ table, limit }) => {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(Math.min(Math.max(limit ?? 10, 1), 25));
        return error ? { ok: false, error: error.message } : { ok: true, data };
      },
    }),

    // ---- proposing a write ----------------------------------------------
    propose_expense: tool({
      description: 'Prepare an expense entry for confirmation. Call list_expense_heads first so the head is real.',
      inputSchema: z.object({
        category_id: z.string(),
        amount: z.string(),
        description: z.string().nullable(),
        paid_by: z.enum(['cash', 'bank', 'bkash', 'nagad']),
      }),
      execute: async (args) => {
        if (!canWrite) return refuseWrite();
        const { data } = await supabase
          .from('expense_categories')
          .select('name, name_bn, group')
          .eq('id', args.category_id)
          .maybeSingle();
        if (!data) return { ok: false, error: 'No such expense head. Call list_expense_heads.' };
        const head = data as { name: string; name_bn: string | null; group: string };
        return prepared({
          kind: 'expense.create',
          summary: {
            en: `Record ৳${args.amount} against ${head.name}`,
            bn: `${head.name_bn ?? head.name} খাতে ৳${args.amount} খরচ লিখুন`,
          },
          fields: [
            field('Head', 'খাত', head.name_bn ?? head.name),
            field('Book', 'খাতা', head.group === 'chairman' ? 'Chairman' : 'Pump'),
            field('Amount', 'পরিমাণ', args.amount),
            field('Paid by', 'যেভাবে', args.paid_by),
            ...(args.description ? [field('For', 'বাবদ', args.description)] : []),
          ],
          payload: { ...args, description: args.description ?? '' },
        });
      },
    }),
    propose_credit_sale: tool({
      description: 'Prepare a credit sale against a party for confirmation. Find the party first.',
      inputSchema: z.object({
        customer_id: z.string(),
        amount: z.string(),
        litres: z.string().nullable(),
        rate: z.string().nullable(),
        vehicle_no: z.string().nullable(),
      }),
      execute: async (args) => {
        if (!canWrite) return refuseWrite();
        const { data } = await supabase
          .from('customers')
          .select('name, name_bn')
          .eq('id', args.customer_id)
          .maybeSingle();
        if (!data) return { ok: false, error: 'No such party. Call find_customer first.' };
        const party = data as { name: string; name_bn: string | null };
        return prepared({
          kind: 'credit_sale.create',
          summary: {
            en: `Book ৳${args.amount} to ${party.name}`,
            bn: `${party.name_bn ?? party.name}-এর নামে ৳${args.amount} বাকি লিখুন`,
          },
          fields: [
            field('Party', 'পার্টি', party.name_bn ?? party.name),
            field('Amount', 'পরিমাণ', args.amount),
            ...(args.litres ? [field('Litres', 'লিটার', args.litres)] : []),
            ...(args.vehicle_no ? [field('Vehicle', 'গাড়ি', args.vehicle_no)] : []),
          ],
          payload: {
            customer_id: args.customer_id,
            amount: args.amount,
            litres: args.litres ?? '',
            rate: args.rate ?? '',
            vehicle_no: args.vehicle_no ?? '',
          },
        });
      },
    }),
    propose_payment: tool({
      description: 'Prepare a payment received from a credit party for confirmation.',
      inputSchema: z.object({
        customer_id: z.string(),
        amount: z.string(),
        method: z.enum(['cash', 'bkash', 'nagad', 'bank', 'cheque', 'adjustment']),
        reference: z.string().nullable(),
        note: z.string().nullable(),
      }),
      execute: async (args) => {
        if (!canWrite) return refuseWrite();
        const { data } = await supabase
          .from('customers')
          .select('name, name_bn')
          .eq('id', args.customer_id)
          .maybeSingle();
        if (!data) return { ok: false, error: 'No such party. Call find_customer first.' };
        const party = data as { name: string; name_bn: string | null };
        return prepared({
          kind: 'payment.receive',
          summary: {
            en: `Receive ৳${args.amount} from ${party.name}`,
            bn: `${party.name_bn ?? party.name}-এর কাছ থেকে ৳${args.amount} জমা নিন`,
          },
          fields: [
            field('Party', 'পার্টি', party.name_bn ?? party.name),
            field('Amount', 'পরিমাণ', args.amount),
            field('Method', 'মাধ্যম', args.method),
            ...(args.reference ? [field('Reference', 'রেফারেন্স', args.reference)] : []),
          ],
          payload: {
            customer_id: args.customer_id,
            amount: args.amount,
            method: args.method,
            reference: args.reference ?? '',
            note: args.note ?? '',
          },
        });
      },
    }),
    propose_party: tool({
      description:
        'Prepare a new credit party, or an edit to an existing one. Pass id to edit; leave id null to create. Find the party first when editing.',
      inputSchema: z.object({
        id: z.string().nullable(),
        name: z.string(),
        name_bn: z.string().nullable(),
        type: z.enum(['company', 'individual', 'govt']),
        phone: z.string().nullable(),
        address: z.string().nullable(),
        vehicle_numbers: z.string().nullable(),
        credit_limit: z.string(),
        opening_balance: z.string(),
        is_active: z.boolean(),
      }),
      execute: async (args) => {
        if (!canWrite) return refuseWrite();
        return prepared({
          kind: 'party.save',
          summary: {
            en: args.id ? `Update the party ${args.name}` : `Create the party ${args.name}`,
            bn: args.id ? `${args.name} পার্টির তথ্য বদলান` : `${args.name} নামে নতুন পার্টি খুলুন`,
          },
          fields: [
            field('Name', 'নাম', args.name),
            field('Type', 'ধরন', args.type),
            field('Credit limit', 'ঋণসীমা', args.credit_limit),
            field('Opening balance', 'প্রারম্ভিক বাকি', args.opening_balance),
            field('Active', 'সচল', args.is_active ? 'yes' : 'no'),
            ...(args.phone ? [field('Phone', 'ফোন', args.phone)] : []),
          ],
          payload: {
            id: args.id ?? '',
            name: args.name,
            name_bn: args.name_bn ?? '',
            type: args.type,
            phone: args.phone ?? '',
            address: args.address ?? '',
            vehicle_numbers: args.vehicle_numbers ?? '',
            credit_limit: args.credit_limit,
            opening_balance: args.opening_balance,
            is_active: args.is_active,
          },
        });
      },
    }),
    propose_balance_adjustment: tool({
      description: 'Prepare an adjustment to a party balance. Owner only; a written reason is required.',
      inputSchema: z.object({ customer_id: z.string(), amount: z.string(), reason: z.string() }),
      execute: async (args) => {
        if (role !== 'admin') {
          return { ok: false, refused: 'Only the owner may adjust a party balance.' };
        }
        return prepared({
          kind: 'balance.adjust',
          summary: {
            en: `Adjust the party balance by ৳${args.amount}`,
            bn: `পার্টির বাকি ৳${args.amount} সমন্বয় করুন`,
          },
          fields: [field('Amount', 'পরিমাণ', args.amount), field('Reason', 'কারণ', args.reason)],
          payload: args,
        });
      },
    }),
    propose_lub_movement: tool({
      description:
        'Prepare a lubricant movement: purchase, sale, own use or an adjustment. Call list_lub_products first. Own use is priced by the database, so send no rate for it.',
      inputSchema: z.object({
        sku_id: z.string(),
        txn_type: z.enum(['purchase', 'sale', 'own_use', 'adjustment']),
        qty: z.string(),
        rate: z.string().nullable(),
        customer_id: z.string().nullable(),
        vehicle_ref: z.string().nullable(),
        note: z.string().nullable(),
      }),
      execute: async (args) => {
        if (!canWrite) return refuseWrite();
        const { data } = await supabase
          .from('lub_skus')
          .select('name, name_bn')
          .eq('id', args.sku_id)
          .maybeSingle();
        if (!data) return { ok: false, error: 'No such product. Call list_lub_products.' };
        const sku = data as { name: string; name_bn: string | null };
        return prepared({
          kind: 'lub.movement',
          summary: {
            en: `Record ${args.qty} of ${sku.name} as ${args.txn_type.replace('_', ' ')}`,
            bn: `${sku.name_bn ?? sku.name} — ${args.qty} (${args.txn_type}) লিখুন`,
          },
          fields: [
            field('Product', 'পণ্য', sku.name_bn ?? sku.name),
            field('Kind', 'ধরন', args.txn_type),
            field('Quantity', 'পরিমাণ', args.qty),
            ...(args.rate ? [field('Rate', 'দর', args.rate)] : []),
          ],
          payload: {
            sku_id: args.sku_id,
            txn_type: args.txn_type,
            qty: args.qty,
            rate: args.rate ?? '',
            customer_id: args.customer_id ?? '',
            vehicle_ref: args.vehicle_ref ?? '',
            note: args.note ?? '',
          },
        });
      },
    }),
    propose_lub_rates: tool({
      description: 'Prepare a change to a lubricant product’s purchase rate, sale rate and reorder level.',
      inputSchema: z.object({
        sku_id: z.string(),
        purchase_rate: z.string(),
        sale_rate: z.string(),
        reorder_level: z.string(),
      }),
      execute: async (args) => {
        if (!canWrite) return refuseWrite();
        return prepared({
          kind: 'lub.rates',
          summary: { en: 'Change the product rates', bn: 'পণ্যের দর বদলান' },
          fields: [
            field('Purchase rate', 'ক্রয় দর', args.purchase_rate),
            field('Sale rate', 'বিক্রয় দর', args.sale_rate),
            field('Reorder level', 'রিঅর্ডার স্তর', args.reorder_level),
          ],
          payload: args,
        });
      },
    }),
    propose_equipment_status: tool({
      description:
        'Prepare pausing, reactivating or removing a tank or dispenser. Owner only; removing needs a reason. Call list_equipment first.',
      inputSchema: z.object({
        kind: z.enum(['tank', 'dispenser']),
        id: z.string(),
        status: z.enum(['active', 'paused', 'removed']),
        reason: z.string().nullable(),
      }),
      execute: async (args) => {
        if (role !== 'admin') return { ok: false, refused: 'Only the owner may pause or remove equipment.' };
        if (args.status === 'removed' && !args.reason?.trim()) {
          return { ok: false, error: 'Removing equipment needs a written reason. Ask for one.' };
        }
        return prepared({
          kind: 'equipment.status',
          summary: {
            en: `Set that ${args.kind} to ${args.status}`,
            bn: `${args.kind === 'tank' ? 'ট্যাংক' : 'ডিসপেনসার'} ${args.status} করুন`,
          },
          fields: [
            field('Equipment', 'যন্ত্র', args.kind),
            field('Status', 'অবস্থা', args.status),
            ...(args.reason ? [field('Reason', 'কারণ', args.reason)] : []),
          ],
          payload: { ...args, reason: args.reason ?? '' },
        });
      },
    }),
    propose_open_shift: tool({
      description: 'Prepare opening the shift covering right now.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!canWrite) return refuseWrite();
        return prepared({
          kind: 'shift.open',
          summary: { en: 'Open the current shift', bn: 'চলতি শিফট চালু করুন' },
          fields: [],
          payload: {},
        });
      },
    }),
    propose_close_shift: tool({
      description:
        'Prepare closing the open shift. Closing needs meter readings and dips the chat cannot collect, so the card takes the person to the close wizard.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!canWrite) return refuseWrite();
        const { data } = await supabase.rpc('chat_shift_status', { p_recent: 1 });
        const status = data as { open?: { shift_date: string; shift_type: string } | null } | null;
        if (!status?.open) return { ok: false, error: 'No shift is open, so there is nothing to close.' };
        return prepared({
          kind: 'shift.close',
          summary: {
            en: `Close the ${status.open.shift_type} shift of ${status.open.shift_date}`,
            bn: `${status.open.shift_date} তারিখের শিফট বন্ধ করুন`,
          },
          fields: [
            field('Date', 'তারিখ', status.open.shift_date),
            field('Shift', 'শিফট', status.open.shift_type),
          ],
          payload: {},
        });
      },
    }),
    propose_edit_entry: tool({
      description:
        'Prepare an edit to one existing entry: its amount, and its description or note. Call list_recent_entries first so the id is real.',
      inputSchema: z.object({
        table: z.enum(EDITABLE_TABLES),
        id: z.string(),
        amount: z.string().nullable(),
        description: z.string().nullable(),
        reason: z.string(),
      }),
      execute: async (args) => {
        if (!canWrite) return refuseWrite();
        const label = TABLE_LABEL[args.table as EditableTable];
        return prepared({
          kind: 'record.edit',
          summary: {
            en: `Edit that ${label.en.toLowerCase()}`,
            bn: `${label.bn} সংশোধন করুন`,
          },
          fields: [
            field('Book', 'খাতা', label.bn),
            ...(args.amount ? [field('New amount', 'নতুন পরিমাণ', args.amount)] : []),
            ...(args.description ? [field('New note', 'নতুন বিবরণ', args.description)] : []),
            field('Reason', 'কারণ', args.reason),
          ],
          payload: {
            table: args.table,
            id: args.id,
            amount: args.amount ?? '',
            description: args.description ?? '',
            reason: args.reason,
          },
        });
      },
    }),
    propose_remove_entry: tool({
      description:
        'Prepare removing one entry. Nothing is erased: the row is marked deleted with the reason, and the audit trail keeps it. Call list_recent_entries first.',
      inputSchema: z.object({
        table: z.enum(EDITABLE_TABLES),
        id: z.string(),
        reason: z.string(),
      }),
      execute: async (args) => {
        if (!canWrite) return refuseWrite();
        const label = TABLE_LABEL[args.table as EditableTable];
        return prepared({
          kind: 'record.void',
          summary: {
            en: `Remove that ${label.en.toLowerCase()}`,
            bn: `${label.bn} বাদ দিন`,
          },
          fields: [field('Book', 'খাতা', label.bn), field('Reason', 'কারণ', args.reason)],
          payload: { table: args.table, id: args.id, reason: args.reason },
        });
      },
    }),
  };

  const key = process.env['LOVABLE_API_KEY'];
  if (!key) {
    return {
      reply:
        lang === 'bn'
          ? 'সহকারীর সংযোগ এখনো তৈরি হয়নি। সব হিসাব স্ক্রিনে আছে।'
          : 'The assistant is not connected yet. Every figure is still on the screens.',
      proposal: null,
    };
  }

  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const lovable = createOpenAI({
    baseURL: 'https://ai.gateway.lovable.dev/v1',
    apiKey: key,
    headers: { 'Lovable-API-Key': key, 'X-Lovable-AIG-SDK': 'vercel-ai-sdk' },
    fetch: runIdFetch.fetch as unknown as typeof fetch,
  });

  let reply = '';
  try {
    const result = streamText({
      model: lovable.responses('openai/gpt-6-astra'),
      system: [
        systemPrompt(ctx, fullName),
        '',
        'SEEING THE WHOLE APP',
        `Today (business date, Asia/Dhaka) is ${(await import('@/lib/format')).businessDate()}. Day shift 10:00-22:00, night 22:00-10:00.`,
        'You can open every report on the Reports page with list_reports and run_report:',
        'oil stock, purchases, tank refills, dips, stock variance, daily sheet, shift',
        'closing, cash book (balance in drawer), due sales, customer ageing, expenses,',
        'lubricants, dispenser performance, profit and loss, audit log. For any question,',
        'fetch the relevant report(s) for the right dates, then compute the answer with',
        'the calculate tool. Show the key figures and how you got them, briefly.',
        'Answer in the language the person writes in (Bangla or English); if unsure use',
        `${lang === 'bn' ? 'Bangla' : 'English'}. Money as ৳ with Bangladeshi grouping, litres with L.`,
        '',
        'WHAT YOU CAN DO',
        'Besides answering, you can prepare work: record an expense, a credit sale, a',
        'payment, a new or edited party, a balance adjustment, a lubricant movement or',
        'rate change, opening a shift, pausing or removing equipment, and editing or',
        'removing a single entry in the expense, credit sale, payment or lubricant books.',
        'Each of those produces a card the person taps. Never say something is saved.',
        'Before editing or removing anything, call list_recent_entries and confirm out',
        'loud which entry you mean, and ask for a reason if none was given.',
      ].join('\n'),
      messages: prior,
      tools,
      stopWhen: stepCountIs(30),
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: 'low',
          reasoningSummary: 'auto',
          store: false,
          include: ['reasoning.encrypted_content'],
        },
      },
    });
    reply = (await result.text).trim();
  } catch (error) {
    console.error('[chat]', error instanceof Error ? error.message : error);
    reply =
      lang === 'bn'
        ? 'উত্তর আনতে সমস্যা হচ্ছে। একটু পরে আবার চেষ্টা করুন — সব হিসাব স্ক্রিনে আছে।'
        : 'I could not reach the assistant just now. Try again shortly — every figure is still on the screens.';
  }

  if (!reply) {
    reply =
      proposal !== null
        ? lang === 'bn'
          ? 'নিচের কার্ডটি তৈরি করেছি। নিশ্চিত করলে তবেই লেখা হবে।'
          : 'I have prepared the card below. Nothing is saved until you confirm it.'
        : lang === 'bn'
          ? 'এটা বের করতে পারলাম না। প্রশ্নটা একটু অন্যভাবে বলুন।'
          : 'I could not work that out. Try asking it a different way.';
  }

  await supabase
    .from('chat_messages')
    .insert({ session_id: sessionId, user_id: userId, role: 'assistant', content: reply, content_lang: lang } as never);

  return { reply, proposal };
}
