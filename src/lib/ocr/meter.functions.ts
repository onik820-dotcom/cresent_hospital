import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Reads a dispenser totalizer from a photograph.
 *
 * What comes back is a suggestion, not a fact: the employee sees the photo and
 * the extracted number side by side and confirms or retypes it before anything
 * is saved. A failure here is never fatal — the number simply gets typed in.
 */

const Input = z.object({
  imageBase64: z.string().min(64),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  knownMachines: z.array(z.string().max(16)).max(24).optional(),
});

export interface MeterOcrResult {
  machineNo: string | null;
  reading: string | null;
  amount: string | null;
  confidence: number;
  notes: string | null;
}

const SYSTEM = `You read mechanical totalizers on fuel dispensers at a filling station in Bangladesh.

A totalizer is the cumulative litre counter on the dispenser face. It is a mechanical odometer-style row of digits — not the per-sale price or volume display, which is usually a brighter electronic panel showing a much smaller number.

The electronic panel usually also shows the current sale: a litre figure and a taka (BDT) figure for the same sale. The taka figure is what goes in "amount".

Rules:
- Report the totalizer exactly as shown, digit for digit. No rounding, no thousands separators.
- "amount" is the taka figure for the sale shown on the electronic display. Digits with at most one decimal point, no currency symbol, no separators. If no sale amount is visible, return null rather than computing one from a rate.
- If a digit is mid-roll between two values, report the lower one and say so in notes.
- If you cannot read it, return null rather than a guess.
- Be conservative with confidence. Only go above 0.9 when every digit is sharp.

Answer with JSON only: {"machine_no": string|null, "reading": string|null, "amount": string|null, "confidence": number, "notes": string|null}`;

export const readMeterPhoto = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<MeterOcrResult | null> => {
    const key = process.env['LOVABLE_API_KEY'];
    if (!key) return null;

    // base64 is about 4/3 of the bytes it encodes.
    if ((data.imageBase64.length * 3) / 4 > 6 * 1024 * 1024) return null;

    const hint =
      data.knownMachines && data.knownMachines.length > 0
        ? ` The machines on this forecourt are: ${data.knownMachines.join(', ')}. If the photo shows one of these, use that exact code.`
        : '';

    try {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'Lovable-API-Key': key,
        },
        body: JSON.stringify({
          model: 'openai/gpt-6-astra',
          messages: [
            { role: 'system', content: SYSTEM },
            {
              role: 'user',
              content: [
                { type: 'text', text: `Read the totalizer on this dispenser.${hint}` },
                {
                  type: 'image_url',
                  image_url: { url: `data:${data.mediaType};base64,${data.imageBase64}` },
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) return null;
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = body.choices?.[0]?.message?.content ?? '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;

      const parsed = JSON.parse(match[0]) as {
        machine_no?: string | null;
        reading?: string | null;
        amount?: string | null;
        confidence?: number;
        notes?: string | null;
      };

      // A reading must be digits with at most one decimal point before it goes
      // anywhere near a litre calculation.
      const raw = (parsed.reading ?? '').trim();
      const reading = /^\d{1,12}(\.\d{1,3})?$/.test(raw) ? raw : null;

      const rawAmount = (parsed.amount ?? '').trim();
      const amount = /^\d{1,10}(\.\d{1,2})?$/.test(rawAmount) ? rawAmount : null;

      return {
        machineNo: parsed.machine_no ?? null,
        reading,
        amount,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        notes: parsed.notes ?? null,
      };
    } catch {
      return null;
    }
  });
