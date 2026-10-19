DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.compute_shift_close(uuid,jsonb)'::regprocedure);
  d := replace(d, 'select ss.book_closing into v_book_open', 'select coalesce(ss.physical_closing, ss.book_closing) into v_book_open');
  EXECUTE d;

  d := pg_get_functiondef('public.enforce_stock_chain()'::regprocedure);
  d := replace(d, 'round(v_prev.book_closing, 3) <> round(new.book_opening, 3)', 'round(coalesce(v_prev.physical_closing, v_prev.book_closing), 3) <> round(new.book_opening, 3)');
  d := replace(d, 'round(new.book_opening, 3), round(v_prev.book_closing, 3)', 'round(new.book_opening, 3), round(coalesce(v_prev.physical_closing, v_prev.book_closing), 3)');
  EXECUTE d;

  d := pg_get_functiondef('public.recalculate_from(uuid)'::regprocedure);
  d := replace(d, E'select ss.book_closing\n      from public.shift_stock ss', E'select coalesce(ss.physical_closing, ss.book_closing)\n      from public.shift_stock ss');
  d := replace(d, E'      v_opening := v_closing;\n', E'      v_opening := coalesce(r_row.physical_closing, v_closing);\n');
  EXECUTE d;
END
$mig$;