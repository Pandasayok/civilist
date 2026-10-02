CREATE TABLE `bookmarks` (
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`)
);
--> statement-breakpoint
CREATE TABLE `content` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_content_kind_status` ON `content` (`kind`,`status`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`answer` text NOT NULL,
	`correct` integer,
	`xp` integer DEFAULT 0 NOT NULL,
	`day` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_user_day` ON `events` (`user_id`,`day`);--> statement-breakpoint
CREATE INDEX `idx_events_user_target` ON `events` (`user_id`,`kind`,`target_id`);--> statement-breakpoint
CREATE TABLE `metadata` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'Софья' NOT NULL,
	`goal` integer DEFAULT 50 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`user_id` text NOT NULL,
	`card_id` text NOT NULL,
	`level` integer DEFAULT 0 NOT NULL,
	`due_at` text NOT NULL,
	`rating` text NOT NULL,
	PRIMARY KEY(`user_id`, `card_id`)
);
