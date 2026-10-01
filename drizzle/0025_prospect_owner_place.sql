DROP INDEX IF EXISTS `prospects_google_place_id_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `prospects_owner_place_idx` ON `prospects` (`created_by_owner_id`, `google_place_id`);
