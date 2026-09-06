CREATE TABLE `service_packages` (
	`service_tier` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`intercept_max_rating` integer NOT NULL,
	CONSTRAINT "service_packages_tier_check" CHECK("service_packages"."service_tier" IN ('BASIC', 'PLUS', 'PRO')),
	CONSTRAINT "service_packages_name_check" CHECK(length(trim("service_packages"."name")) BETWEEN 1 AND 40),
	CONSTRAINT "service_packages_intercept_check" CHECK(typeof("service_packages"."intercept_max_rating") = 'integer' AND (("service_packages"."service_tier" = 'BASIC' AND "service_packages"."intercept_max_rating" = 0) OR ("service_packages"."service_tier" IN ('PLUS', 'PRO') AND "service_packages"."intercept_max_rating" BETWEEN 1 AND 5)))
);
--> statement-breakpoint
INSERT INTO `service_packages` (`service_tier`, `name`, `intercept_max_rating`) VALUES ('BASIC', 'Basic', 0);
--> statement-breakpoint
INSERT INTO `service_packages` (`service_tier`, `name`, `intercept_max_rating`) VALUES ('PLUS', 'Plus', 3);
--> statement-breakpoint
INSERT INTO `service_packages` (`service_tier`, `name`, `intercept_max_rating`) VALUES ('PRO', 'Pro', 3);
