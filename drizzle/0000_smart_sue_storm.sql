CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_batches_owner_updated` ON `batches` (`owner`,`updated_at`);--> statement-breakpoint
CREATE TABLE `batch_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`owner` text NOT NULL,
	`code` text NOT NULL,
	`code_key` text NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_codes_batch_key` ON `batch_codes` (`batch_id`,`code_key`);--> statement-breakpoint
CREATE INDEX `idx_codes_owner_batch` ON `batch_codes` (`owner`,`batch_id`);--> statement-breakpoint
CREATE TABLE `order_history` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`order_id` text NOT NULL,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_history_owner_order` ON `order_history` (`owner`,`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`patient` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`upc` text DEFAULT '' NOT NULL,
	`lab` text DEFAULT '' NOT NULL,
	`ordered_on` text DEFAULT '' NOT NULL,
	`due_on` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Received' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_orders_owner_updated` ON `orders` (`owner`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_orders_owner_status` ON `orders` (`owner`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_orders_owner_reference` ON `orders` (`owner`,`reference`) WHERE "orders"."reference" <> '';