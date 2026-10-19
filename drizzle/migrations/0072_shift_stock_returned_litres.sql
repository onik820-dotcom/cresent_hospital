ALTER TABLE public.shift_stock ADD COLUMN IF NOT EXISTS returned_litres numeric(12,3) NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.shift_stock.returned_litres IS 'Litres sent from this tank back to purchased oil (tank_returns) during the shift.';

DO $mig$
DECLARE
  d text;
  procedure_rep text[][];
  f record;
  o text;
BEGIN
  FOR f IN SELECT * FROM (VALUES
    ('compute_shift_close', 1), ('close_shift', 2), ('enforce_stock_chain', 3), ('recalculate_from', 4)) AS t(n, k)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p
     WHERE p.proname = f.n AND p.pronamespace = 'public'::regnamespace;
    o := d;
    IF f.k = 1 THEN
      d := replace(d, E'  v_refill        numeric;', E'  v_refill        numeric;\n  v_returned      numeric;');
      d := replace(d, E'    v_sold := round(coalesce((v_sold_by_tank',
        E'    v_returned := coalesce((select sum(tr.litres) from public.tank_returns tr\n      where tr.deleted_at is null and tr.tank_id = v_tank.id\n        and (tr.shift_id = p_shift_id\n             or (tr.shift_id is null and tr.returned_at >= v_shift.starts_at and tr.returned_at < v_shift.ends_at))\n        and (v_open_at is null or tr.returned_at > v_open_at)), 0);\n    v_sold := round(coalesce((v_sold_by_tank');
      d := replace(d, 'v_book_close := round(v_book_open + v_refill - v_sold, 3);', 'v_book_close := round(v_book_open + v_refill - v_returned - v_sold, 3);');
      d := replace(d, '''refill_litres'', v_refill, ''sold_from_tank''', '''refill_litres'', v_refill, ''returned_litres'', v_returned, ''sold_from_tank''');
    ELSIF f.k = 2 THEN
      d := replace(d, '(shift_id, tank_id, book_opening, refill_litres, sold_from_tank,', '(shift_id, tank_id, book_opening, refill_litres, returned_litres, sold_from_tank,');
      d := replace(d, E'(v_tank->>''book_opening'')::numeric, (v_tank->>''refill_litres'')::numeric,\n',
        E'(v_tank->>''book_opening'')::numeric, (v_tank->>''refill_litres'')::numeric,\n       coalesce((v_tank->>''returned_litres'')::numeric, 0),\n');
      d := replace(d, 'book_opening = excluded.book_opening, refill_litres = excluded.refill_litres,', E'book_opening = excluded.book_opening, refill_litres = excluded.refill_litres,\n      returned_litres = excluded.returned_litres,');
    ELSIF f.k = 3 THEN
      d := replace(d, 'round(new.book_opening + new.refill_litres - new.sold_from_tank, 3)', 'round(new.book_opening + new.refill_litres - coalesce(new.returned_litres, 0) - new.sold_from_tank, 3)');
    ELSE
      d := replace(d, 'select ss.id, ss.shift_id, ss.refill_litres, ss.sold_from_tank,', 'select ss.id, ss.shift_id, ss.refill_litres, ss.returned_litres, ss.sold_from_tank,');
      d := replace(d, 'v_closing := round(v_opening + r_row.refill_litres - r_row.sold_from_tank, 3);', 'v_closing := round(v_opening + r_row.refill_litres - r_row.returned_litres - r_row.sold_from_tank, 3);');
    END IF;
    IF d = o THEN RAISE EXCEPTION 'No change applied to %', f.n; END IF;
    EXECUTE d;
  END LOOP;
END
$mig$;

-- Backfill closed shifts that already had returns.
ALTER TABLE public.shift_stock DISABLE TRIGGER USER;
UPDATE public.shift_stock ss SET returned_litres = x.l,
  book_closing = round(ss.book_opening + ss.refill_litres - x.l - ss.sold_from_tank, 3),
  variance_litres = CASE WHEN ss.physical_closing IS NULL THEN NULL
    ELSE round(ss.physical_closing - (ss.book_opening + ss.refill_litres - x.l - ss.sold_from_tank), 3) END
FROM (SELECT tr.shift_id, tr.tank_id, sum(tr.litres) l FROM public.tank_returns tr
      WHERE tr.deleted_at IS NULL AND tr.shift_id IS NOT NULL GROUP BY 1, 2) x
WHERE ss.shift_id = x.shift_id AND ss.tank_id = x.tank_id;
UPDATE public.shift_stock SET
  variance_pct = CASE WHEN sold_from_tank = 0 OR variance_litres IS NULL THEN NULL ELSE round(variance_litres / sold_from_tank * 100, 4) END,
  variance_flagged = coalesce(public.variance_is_flagged(variance_litres,
    CASE WHEN sold_from_tank = 0 OR variance_litres IS NULL THEN NULL ELSE round(variance_litres / sold_from_tank * 100, 4) END), false)
WHERE returned_litres <> 0;
ALTER TABLE public.shift_stock ENABLE TRIGGER USER;