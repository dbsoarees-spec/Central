CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_user_id` text,
	`actor_email` text NOT NULL,
	`previous_value` text,
	`new_value` text,
	`request_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `client_addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`type` text NOT NULL,
	`label` text,
	`contact_name` text,
	`phone` text,
	`cep` text,
	`street` text NOT NULL,
	`number` text NOT NULL,
	`complement` text,
	`district` text NOT NULL,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "client_addresses_type_check" CHECK("client_addresses"."type" in ('COBRANCA', 'COLETA', 'ENTREGA'))
);
--> statement-breakpoint
CREATE INDEX `client_addresses_client_idx` ON `client_addresses` (`client_id`);--> statement-breakpoint
CREATE TABLE `client_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`whatsapp` text,
	`email` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `client_contacts_client_idx` ON `client_contacts` (`client_id`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`legal_name` text NOT NULL,
	`trade_name` text,
	`cpf_cnpj` text,
	`state_registration` text,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "clients_type_check" CHECK("clients"."type" in ('PF', 'PJ'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_document_unique` ON `clients` (`cpf_cnpj`);--> statement-breakpoint
CREATE INDEX `clients_legal_name_idx` ON `clients` (`legal_name`);--> statement-breakpoint
CREATE TABLE `financial_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `financial_accounts_name_unique` ON `financial_accounts` (`name`);--> statement-breakpoint
CREATE TABLE `freight_costs` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`category` text NOT NULL,
	`provider_id` text,
	`provider_name` text,
	`description` text,
	`occurred_on` text,
	`amount_cents` integer NOT NULL,
	`confirmed` integer DEFAULT false NOT NULL,
	`source_column` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `freight_sales`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "freight_costs_amount_check" CHECK("freight_costs"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `freight_costs_sale_idx` ON `freight_costs` (`sale_id`);--> statement-breakpoint
CREATE INDEX `freight_costs_category_idx` ON `freight_costs` (`category`);--> statement-breakpoint
CREATE TABLE `freight_sales` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_number` text NOT NULL,
	`sale_date` text NOT NULL,
	`competency` text NOT NULL,
	`seller_id` text,
	`seller_name` text NOT NULL,
	`client_id` text,
	`vehicle` text,
	`plate` text,
	`initial_provider_id` text,
	`initial_provider_name` text,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`pickup_address_snapshot` text,
	`delivery_address_snapshot` text,
	`delivery_deadline` text,
	`financial_due_date` text NOT NULL,
	`operational_status` text NOT NULL,
	`legacy_operational_status` text,
	`notes` text,
	`freight_amount_cents` integer NOT NULL,
	`commission_basis_points` integer NOT NULL,
	`costs_pending` integer DEFAULT true NOT NULL,
	`import_key` text,
	`source_workbook` text,
	`source_sheet` text,
	`source_month` text,
	`source_row` integer,
	`source_hash` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`initial_provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "freight_sales_amount_check" CHECK("freight_sales"."freight_amount_cents" >= 0),
	CONSTRAINT "freight_sales_commission_check" CHECK("freight_sales"."commission_basis_points" between 0 and 10000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `freight_sales_number_unique` ON `freight_sales` (`sale_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `freight_sales_import_key_unique` ON `freight_sales` (`import_key`);--> statement-breakpoint
CREATE INDEX `freight_sales_competency_idx` ON `freight_sales` (`competency`);--> statement-breakpoint
CREATE INDEX `freight_sales_client_idx` ON `freight_sales` (`client_id`);--> statement-breakpoint
CREATE INDEX `freight_sales_seller_idx` ON `freight_sales` (`seller_id`);--> statement-breakpoint
CREATE INDEX `freight_sales_due_date_idx` ON `freight_sales` (`financial_due_date`);--> statement-breakpoint
CREATE TABLE `import_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`import_key` text NOT NULL,
	`workbook_name` text NOT NULL,
	`source_hash` text NOT NULL,
	`status` text NOT NULL,
	`valid_rows` integer NOT NULL,
	`warning_rows` integer NOT NULL,
	`error_rows` integer NOT NULL,
	`imported_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_runs_key_unique` ON `import_runs` (`import_key`);--> statement-breakpoint
CREATE TABLE `payment_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`installment_id` text,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`payment_method` text NOT NULL,
	`financial_account_id` text,
	`notes` text,
	`reversed_transaction_id` text,
	`idempotency_key` text NOT NULL,
	`proof_key` text,
	`proof_name` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `freight_sales`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`installment_id`) REFERENCES `receivable_installments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`financial_account_id`) REFERENCES `financial_accounts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "payment_transactions_type_check" CHECK("payment_transactions"."type" in ('ADIANTAMENTO', 'RECEBIMENTO', 'ESTORNO')),
	CONSTRAINT "payment_transactions_status_check" CHECK("payment_transactions"."status" in ('PENDENTE', 'CONFIRMADO', 'CANCELADO')),
	CONSTRAINT "payment_transactions_amount_check" CHECK("payment_transactions"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_transactions_idempotency_unique` ON `payment_transactions` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_transactions_reverse_unique` ON `payment_transactions` (`reversed_transaction_id`);--> statement-breakpoint
CREATE INDEX `payment_transactions_sale_idx` ON `payment_transactions` (`sale_id`);--> statement-breakpoint
CREATE INDEX `payment_transactions_occurred_idx` ON `payment_transactions` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`document` text,
	`phone` text,
	`email` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `providers_document_unique` ON `providers` (`document`);--> statement-breakpoint
CREATE INDEX `providers_name_idx` ON `providers` (`name`);--> statement-breakpoint
CREATE TABLE `receivable_installments` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`installment_number` integer NOT NULL,
	`installment_count` integer NOT NULL,
	`due_date` text NOT NULL,
	`payment_method` text NOT NULL,
	`financial_account_id` text,
	`expected_amount_cents` integer NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `freight_sales`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`financial_account_id`) REFERENCES `financial_accounts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "receivable_installments_numbers_check" CHECK("receivable_installments"."installment_number" > 0 and "receivable_installments"."installment_count" >= "receivable_installments"."installment_number"),
	CONSTRAINT "receivable_installments_amount_check" CHECK("receivable_installments"."expected_amount_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receivable_installments_sale_number_unique` ON `receivable_installments` (`sale_id`,`installment_number`);--> statement-breakpoint
CREATE INDEX `receivable_installments_due_idx` ON `receivable_installments` (`due_date`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "users_role_check" CHECK("users"."role" in ('ADMIN', 'GERENCIA', 'VENDEDOR', 'FINANCEIRO'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);