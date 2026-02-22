-- Vertical position only: placement becomes 'top' | 'bottom'. Horizontal locked to center.
-- ADD-ONLY: does not drop table or alter other columns. Only placement constraint and default.

-- Map existing values to 'bottom' so no data is invalid
UPDATE public.pdf_settings SET placement = 'bottom' WHERE placement NOT IN ('top', 'bottom');

-- Replace placement constraint with top/bottom only
ALTER TABLE public.pdf_settings DROP CONSTRAINT IF EXISTS pdf_settings_placement_check;
ALTER TABLE public.pdf_settings ADD CONSTRAINT pdf_settings_placement_check CHECK (placement IN ('top', 'bottom'));

ALTER TABLE public.pdf_settings ALTER COLUMN placement SET DEFAULT 'bottom';
