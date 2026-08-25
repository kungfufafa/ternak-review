DELETE FROM `rate_limits`
WHERE `id` NOT IN (
  SELECT MIN(`id`) FROM `rate_limits` GROUP BY `bucket_key`, `window_start`
);--> statement-breakpoint
DROP INDEX IF EXISTS `rate_limits_bucket_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limits_bucket_window_idx` ON `rate_limits` (`bucket_key`,`window_start`);
