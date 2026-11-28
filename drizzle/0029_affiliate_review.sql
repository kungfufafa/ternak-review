ALTER TABLE affiliate_leads ADD COLUMN status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'));
--> statement-breakpoint
ALTER TABLE affiliate_leads ADD COLUMN referral_url text;
