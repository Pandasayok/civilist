CREATE TABLE `assessment_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_key` text NOT NULL,
	`mode` text NOT NULL,
	`branch_id` text NOT NULL,
	`target` text NOT NULL,
	`title` text NOT NULL,
	`questions` text NOT NULL,
	`answers` text DEFAULT '{}' NOT NULL,
	`result` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_one_active` ON `assessment_attempts` (`user_id`,`target_key`) WHERE "assessment_attempts"."status"='active';--> statement-breakpoint
CREATE INDEX `assessment_history` ON `assessment_attempts` (`user_id`,`target_key`,`status`);