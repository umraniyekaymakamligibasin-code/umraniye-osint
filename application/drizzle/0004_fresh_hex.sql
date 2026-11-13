ALTER TABLE `case_records` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `case_records` ADD `longitude` real;--> statement-breakpoint
ALTER TABLE `case_records` ADD `location_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `case_records_event_id_unique` ON `case_records` (`event_id`);