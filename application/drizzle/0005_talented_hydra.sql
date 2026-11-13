CREATE TABLE `personal_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`event_id` text NOT NULL,
	`title` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `personal_activity_account_time` ON `personal_activity` (`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `personal_records` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`event_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	`saved` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`viewed_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_records_account_event_unique` ON `personal_records` (`account_id`,`event_id`);