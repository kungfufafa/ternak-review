CREATE TABLE `access_roles` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`system` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `access_roles` (`key`, `name`, `system`) VALUES
	('SUPER_ADMIN', 'Super admin', 1),
	('ADMIN', 'Admin', 1),
	('USER', 'Pemegang kartu', 1);
