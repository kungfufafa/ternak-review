CREATE TABLE `role_grants` (
	`role` text NOT NULL,
	`permission` text NOT NULL,
	PRIMARY KEY(`role`, `permission`)
);
