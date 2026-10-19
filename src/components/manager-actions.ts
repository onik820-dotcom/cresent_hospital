
import { createClient } from '@/lib/data/client';
import { getSessionProfile } from '@/lib/session';
import { businessDate, currentShiftType, TIMEZONE } from '@/lib/format';
import { fromZonedTime } from 'date-fns-tz';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Open the shift covering right now.
 *
 * Minimal on purpose: the full lifecycle — rate confirmation, the close wizard,
 * sign-off, reopening — is Phase 4. A dispenser cannot record anything without
 * an open shift to attach it to, so this much has to exist first.
 *
 * Day runs 10:00–22:00 and night 22:00–10:00, Asia/Dhaka. A night shift is
 * attributed to the date it opened on, which is what `businessDate` computes,
 * so the row lands on the right business day even at 02:00.
 */
export async function openCurrentShift(): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'manager' && profile?.role !== 'admin' && profile?.role !== 'md') {
    return { ok: false, error: 'Only a manager, the owner or the MD may open a shift' };
  }

  const now = new Date();
  const shiftDate = businessDate(now);
  const shiftType = currentShiftType(now);

  // Build the window in Dhaka local time, then convert back to an instant.
  const startsAt =
    shiftType === 'day'
      ? fromZonedTime(`${shiftDate} 10:00:00`, TIMEZONE)
      : fromZonedTime(`${shiftDate} 22:00:00`, TIMEZONE);
  const endsAt = new Date(startsAt.getTime() + 12 * 60 * 60 * 1000);

  const supabase = await createClient();
  const { data: station } = await supabase.from('stations').select('id').limit(1).maybeSingle();

  const { error } = await supabase.from('shifts').insert({
    station_id: station?.id ?? null,
    shift_date: shiftDate,
    shift_type: shiftType,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: 'open',
    opened_by: profile.id,
    created_by: profile.id,
  });

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'That shift has already been opened for today' };
    }
    return { ok: false, error: error.message };
  }

  
  
  return { ok: true };
}
