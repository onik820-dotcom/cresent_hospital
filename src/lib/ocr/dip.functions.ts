import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Reads a tank dip rod from a photograph.
 *
 * What comes back is a suggestion, not a fact: the employee sees the scanned
 * millimetre figure on the entry screen and confirms or retypes it before
 * anything is saved. A failure here is never fatal — the number is typed in.
 */

const Input = z.object({
  imageBase64: z.string().min(64),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  // The tank's certified maximum; a scanned figure above it is never trusted.
  maxDipMm: z.number().int().positive().max(5000).optional(),
});

export interface DipOcrResult {
  dipMm: string | null;
  confidence: number;
  notes: string | null;
}

const SYSTEM = `You read fuel tank dip rods (dipsticks) at a filling station in Bangladesh.

A dip rod is a graduated metal or wooden rod lowered into a tank; the fuel wets it up to the surface level, and the reading is the millimetre mark at the wet/dry line. Photos usually show the rod held up with the wet section visible, sometimes with a finger marking the line.

Rules:
- Report the wet/dry line in millimetres as a whole number. No decimals, no units, no separators.
- The rod's etched numbers are the scale — read the mark at the fuel line, not the total rod length.
- If the wet line is unclear, return null rather than a guess.
- Be conservative with confidence. Only go above 0.9 when the line and the scale are both sharp.

Answer with JSON only: {"dip_mm": string|null, "confidence": number, "notes": string|null}`;

export const readDipPhoto = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<DipOcrResult | null> => {
    const key = process.env['LOVABLE_API_KEY'];
    if (!key) return null;

    // base64 is about 4/3 of the bytes it encodes.
    if ((data.imageBase64.length * 3) / 4 > 6 * 1024 * 1024) return null;

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
                { type: 'text', text: 'Read the fuel level on this dip rod in millimetres.' },
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
        dip_mm?: string | null;
        confidence?: number;
        notes?: string | null;
      };

      // A dip is a whole number of millimetres within the tank's certified range.
      const raw = (parsed.dip_mm ?? '').trim();
      let dipMm: string | null = /^\d{1,4}$/.test(raw) ? raw : null;
      if (dipMm !== null && data.maxDipMm !== undefined && Number(dipMm) > data.maxDipMm) {
        dipMm = null;
      }

      return {
        dipMm,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        notes: parsed.notes ?? null,
      };
    } catch {
      return null;
    }
  });
