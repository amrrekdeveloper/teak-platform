CREATE TYPE "public"."appointment_fail_reason" AS ENUM('lazy', 'emergency', 'client_not_available', 'client_cancelled');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'attended', 'no_show', 'client_refused', 'rescheduled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('active', 'returned');--> statement-breakpoint
CREATE TYPE "public"."building_status_type" AS ENUM('ready', 'under_construction');--> statement-breakpoint
CREATE TYPE "public"."building_visit_status" AS ENUM('interested', 'under_construction', 'not_suitable', 'follow_up');--> statement-breakpoint
CREATE TYPE "public"."check_result" AS ENUM('pass', 'fail', 'conditional');--> statement-breakpoint
CREATE TYPE "public"."check_type" AS ENUM('material_incoming', 'in_process', 'final_product');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."contract_type" AS ENUM('fixed', 'open', 'temporary', 'training');--> statement-breakpoint
CREATE TYPE "public"."customer_source" AS ENUM('website', 'walk_in', 'referral', 'phone', 'social_media');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('scheduled', 'in_transit', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."department" AS ENUM('sales', 'design', 'production', 'warehouse', 'finance', 'hr', 'it', 'delivery', 'installation', 'quality', 'management', 'customer_service');--> statement-breakpoint
CREATE TYPE "public"."design_assignment_status" AS ENUM('pending', 'designing', 'completed', 'revision');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'inactive', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."installation_status" AS ENUM('scheduled', 'in_progress', 'completed', 'rescheduled');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('quotation', 'simplified_tax_invoice');--> statement-breakpoint
CREATE TYPE "public"."maintenance_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."maintenance_status" AS ENUM('pending', 'scheduled', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."nationality" AS ENUM('saudi', 'resident');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('info', 'warning', 'action', 'success');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer', 'cash', 'card');--> statement-breakpoint
CREATE TYPE "public"."payment_schedule_status" AS ENUM('pending', 'due', 'paid', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."payment_schedule_trigger" AS ENUM('on_approval', 'on_production', 'on_delivery', 'on_installation', 'on_completion');--> statement-breakpoint
CREATE TYPE "public"."payment_stage" AS ENUM('deposit', 'pre_manufacturing', 'delivery', 'final', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."po_status" AS ENUM('draft', 'pending_approval', 'approved', 'ordered', 'partially_received', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('normal', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."product_category" AS ENUM('kitchen', 'wardrobe', 'door', 'decoration', 'hotel');--> statement-breakpoint
CREATE TYPE "public"."production_stage" AS ENUM('cutting', 'edging', 'assembly', 'finishing');--> statement-breakpoint
CREATE TYPE "public"."quotation_status" AS ENUM('requested', 'open', 'draft', 'sent', 'approved', 'rejected', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."reset_request_status" AS ENUM('pending', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."stage_status" AS ENUM('pending', 'in_progress', 'completed', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('stock_in', 'stock_out', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."unit" AS ENUM('piece', 'meter', 'sqm', 'kg', 'liter', 'sheet');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'assistant', 'sales', 'designer', 'production', 'purchasing', 'warehouse', 'accountant', 'customer_service', 'delivery', 'installation', 'quality', 'hr', 'it', 'customer');--> statement-breakpoint
CREATE TYPE "public"."warranty_status" AS ENUM('active', 'expired', 'claimed', 'void');--> statement-breakpoint
CREATE TYPE "public"."work_order_status" AS ENUM('pending', 'in_production', 'quality_check', 'ready', 'shipped', 'delivered', 'installed', 'completed');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" integer,
	"details" jsonb,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adeko_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"description_en" text NOT NULL,
	"description_ar" text,
	"group_code" text NOT NULL,
	"group_name_ar" text NOT NULL,
	"group_name_en" text NOT NULL,
	"manufacturing_w" numeric(10, 2),
	"manufacturing_h" numeric(10, 2),
	"manufacturing_d" numeric(10, 2),
	"design_w" numeric(10, 2),
	"design_h" numeric(10, 2),
	"design_d" numeric(10, 2),
	"price_before_vat" numeric(12, 2) DEFAULT '0',
	"price_after_vat" numeric(12, 2) DEFAULT '0',
	"thumbnail" text,
	"usage_type" text DEFAULT 'kitchen' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "adeko_products_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"assigned_to" integer NOT NULL,
	"customer_id" integer,
	"quotation_id" integer,
	"title" text NOT NULL,
	"appointment_date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"fail_reason" text,
	"fail_notes" text,
	"notes" text,
	"rescheduled_to" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "building_visits" (
	"id" serial PRIMARY KEY NOT NULL,
	"rep_id" integer NOT NULL,
	"lat" numeric(10, 7) NOT NULL,
	"lng" numeric(10, 7) NOT NULL,
	"address" text,
	"city" text,
	"district" text,
	"building_status" "building_visit_status" DEFAULT 'follow_up' NOT NULL,
	"notes" text,
	"quotation_id" integer,
	"visited_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"vat_number" text NOT NULL,
	"address" text NOT NULL,
	"phone" text,
	"email" text,
	"logo" text,
	"stamp_image" text
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_number" text NOT NULL,
	"customer_id" integer NOT NULL,
	"quotation_id" integer,
	"total_amount" numeric(12, 2) NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"remaining_amount" numeric(12, 2) NOT NULL,
	"status" "contract_status" DEFAULT 'active' NOT NULL,
	"signed_date" date,
	"expected_delivery_date" date,
	"payment_schedule" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_contract_number_unique" UNIQUE("contract_number")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"city" text,
	"district" text,
	"building_status" text,
	"source" "customer_source" DEFAULT 'phone',
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_sales_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"sales_rep_id" integer NOT NULL,
	"calls_count" integer DEFAULT 0 NOT NULL,
	"whatsapp_count" integer DEFAULT 0 NOT NULL,
	"showroom_visits" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_id" integer NOT NULL,
	"scheduled_date" date,
	"delivered_date" date,
	"status" "delivery_status" DEFAULT 'scheduled' NOT NULL,
	"delivered_by" integer,
	"notes" text,
	"customer_signature" text,
	"delivery_photos" text[]
);
--> statement-breakpoint
CREATE TABLE "design_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"quotation_id" integer,
	"assigned_to" integer NOT NULL,
	"status" "design_assignment_status" DEFAULT 'pending' NOT NULL,
	"measurements" jsonb,
	"product_specs" jsonb,
	"sketch_data" text,
	"sketch_image" text,
	"screenshot_3d" text,
	"design_files" text[],
	"notes" text,
	"product_description" text,
	"customer_approval" text,
	"customer_approval_notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "door_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"price_per_meter" numeric(10, 2) NOT NULL,
	"wood_type_id" integer,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"asset_type" text NOT NULL,
	"description" text NOT NULL,
	"serial_number" text,
	"status" "asset_status" DEFAULT 'active' NOT NULL,
	"assigned_at" date NOT NULL,
	"returned_at" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"employee_number" text NOT NULL,
	"nationality" "nationality" NOT NULL,
	"position" text NOT NULL,
	"department" "department" NOT NULL,
	"monthly_salary" numeric(10, 2) NOT NULL,
	"iqama_number" text,
	"iqama_expiry" date,
	"contract_start" date NOT NULL,
	"contract_end" date,
	"status" "employee_status" DEFAULT 'active' NOT NULL,
	"fingerprint_location" text,
	"contract_type" "contract_type",
	"insurance_expiry" date,
	"finger_scan_location" text,
	"phone" text,
	"email" text,
	"documents" jsonb,
	"attendance_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employees_employee_number_unique" UNIQUE("employee_number")
);
--> statement-breakpoint
CREATE TABLE "hr_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"performed_by" integer,
	"target_user_id" integer,
	"employee_id" integer,
	"action" text NOT NULL,
	"details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installations" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_id" integer NOT NULL,
	"scheduled_date" date,
	"completed_date" date,
	"status" "installation_status" DEFAULT 'scheduled' NOT NULL,
	"installed_by" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"material_name_ar" text NOT NULL,
	"material_name_en" text NOT NULL,
	"sku" text,
	"category" text,
	"unit" "unit" DEFAULT 'piece' NOT NULL,
	"quantity" numeric(12, 2) DEFAULT '0' NOT NULL,
	"min_quantity" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cost_per_unit" numeric(10, 2),
	"location" text,
	"last_updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"inventory_id" integer NOT NULL,
	"type" "transaction_type" NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"reason" text,
	"work_order_id" integer,
	"purchase_order_id" integer,
	"performed_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" serial NOT NULL,
	"contract_id" integer,
	"quotation_id" integer,
	"customer_id" integer NOT NULL,
	"payment_stage" "payment_stage",
	"type" "invoice_type" DEFAULT 'quotation' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '15' NOT NULL,
	"vat_amount" numeric(12, 2) NOT NULL,
	"total_with_vat" numeric(12, 2) NOT NULL,
	"seller_name" text NOT NULL,
	"seller_vat_number" text NOT NULL,
	"seller_address" text NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_phone" text,
	"payment_method" text,
	"qr_code_data" text,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"issued_at" timestamp,
	"paid_at" timestamp,
	"cancelled_at" timestamp,
	"notes" text,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "job_titles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"department" "department",
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_number" serial NOT NULL,
	"customer_id" integer NOT NULL,
	"contract_id" integer,
	"description" text NOT NULL,
	"media_urls" text[],
	"status" "maintenance_status" DEFAULT 'pending' NOT NULL,
	"priority" "maintenance_priority" DEFAULT 'normal' NOT NULL,
	"scheduled_date" date,
	"completed_date" date,
	"resolution" text,
	"assigned_to" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"rep_id" integer NOT NULL,
	"name" text NOT NULL,
	"polygon" jsonb NOT NULL,
	"target_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title_ar" text NOT NULL,
	"title_en" text NOT NULL,
	"message_ar" text NOT NULL,
	"message_en" text NOT NULL,
	"type" "notification_type" DEFAULT 'info' NOT NULL,
	"related_entity" text,
	"related_id" integer,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "osm_buildings_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"bbox" text NOT NULL,
	"buildings" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "osm_buildings_cache_bbox_unique" UNIQUE("bbox")
);
--> statement-breakpoint
CREATE TABLE "password_reset_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"status" "reset_request_status" DEFAULT 'pending' NOT NULL,
	"note" text,
	"resolved_by" integer,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"quotation_id" integer NOT NULL,
	"contract_id" integer,
	"customer_id" integer NOT NULL,
	"installment_number" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"percentage" numeric(5, 2),
	"trigger_stage" "payment_schedule_trigger" NOT NULL,
	"due_date" date,
	"status" "payment_schedule_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"payment_method" text,
	"receipt_data" text,
	"confirmed_by" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"invoice_id" integer,
	"amount" numeric(12, 2) NOT NULL,
	"payment_stage" "payment_stage" NOT NULL,
	"method" "payment_method" NOT NULL,
	"payment_status" "payment_status" DEFAULT 'confirmed' NOT NULL,
	"bank_reference" text,
	"receipt_number" text,
	"attachment_url" text,
	"notes" text,
	"recorded_by" integer,
	"confirmed_by" integer,
	"confirmed_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_id" integer NOT NULL,
	"stage" "production_stage" NOT NULL,
	"status" "stage_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"notes" text,
	"assigned_to" integer
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"category" "product_category" NOT NULL,
	"description_ar" text,
	"description_en" text,
	"images" text[],
	"featured" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" serial NOT NULL,
	"supplier_id" integer NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"status" "po_status" DEFAULT 'draft' NOT NULL,
	"approved_by" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_id" integer NOT NULL,
	"check_type" "check_type" NOT NULL,
	"result" "check_result" NOT NULL,
	"notes" text,
	"checked_by" integer,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"quotation_number" serial NOT NULL,
	"customer_id" integer NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_area" numeric(10, 2),
	"subtotal" numeric(12, 2) NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '15' NOT NULL,
	"vat_amount" numeric(12, 2) NOT NULL,
	"total_price" numeric(12, 2) NOT NULL,
	"discount" numeric(12, 2) DEFAULT '0',
	"final_price" numeric(12, 2) NOT NULL,
	"status" "quotation_status" DEFAULT 'draft' NOT NULL,
	"assigned_to" integer,
	"assigned_at" timestamp,
	"claimed_at" timestamp,
	"previous_assignees" jsonb DEFAULT '[]'::jsonb,
	"design_file" text,
	"valid_until" date,
	"inspection_date" date,
	"delivery_days" integer,
	"city" text,
	"notes" text,
	"order_stage" text DEFAULT 'new',
	"cancellation_reason" text,
	"cancelled_at" timestamp,
	"attachment_data" text,
	"attachment_name" text,
	"attachment_mime" text,
	"show_attachment_to_customer" boolean DEFAULT false,
	"attached_design_files" jsonb DEFAULT '[]'::jsonb,
	"payment_receipt_data" text,
	"payment_receipt_name" text,
	"approved_by" integer,
	"approved_at" timestamp,
	"warranty_months" integer DEFAULT 24,
	"payment_installments" jsonb DEFAULT '[]'::jsonb,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_product_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_surveys" (
	"id" serial PRIMARY KEY NOT NULL,
	"appointment_id" integer NOT NULL,
	"customer_id" integer,
	"quotation_id" integer,
	"room_length" numeric(10, 2),
	"room_width" numeric(10, 2),
	"room_height" numeric(10, 2),
	"building_status" text,
	"construction_phase" text,
	"doors_count" integer,
	"windows_count" integer,
	"door_details" jsonb,
	"window_details" jsonb,
	"electrical_outlets" jsonb,
	"drainage_points" jsonb,
	"obstacles" text,
	"walls" jsonb,
	"spaces" jsonb,
	"selected_products" jsonb,
	"notes" text,
	"photos" text[],
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"phone" text,
	"email" text,
	"address" text,
	"materials" text,
	"tax_number" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_design_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer,
	"quotation_id" integer,
	"file_name" text NOT NULL,
	"file_label" text,
	"file_data" text,
	"file_url" text,
	"mime_type" text DEFAULT 'application/pdf' NOT NULL,
	"file_size" integer DEFAULT 0 NOT NULL,
	"attach_to_quote" boolean DEFAULT false NOT NULL,
	"uploaded_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"full_name_ar" text NOT NULL,
	"full_name_en" text NOT NULL,
	"phone" text,
	"email" text,
	"profile_image" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "warranties" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer,
	"work_order_id" integer,
	"customer_id" integer NOT NULL,
	"quotation_id" integer,
	"duration_months" integer DEFAULT 24,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"terms" text,
	"status" "warranty_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wood_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"price_per_meter" numeric(10, 2) NOT NULL,
	"category" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" serial NOT NULL,
	"contract_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"quotation_id" integer,
	"design_file" text,
	"specifications" jsonb,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"status" "work_order_status" DEFAULT 'pending' NOT NULL,
	"assigned_to" integer,
	"delivery_days" integer,
	"production_start_date" timestamp,
	"start_date" date,
	"due_date" date,
	"completed_date" date,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "building_visits" ADD CONSTRAINT "building_visits_rep_id_users_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "building_visits" ADD CONSTRAINT "building_visits_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_sales_logs" ADD CONSTRAINT "daily_sales_logs_sales_rep_id_users_id_fk" FOREIGN KEY ("sales_rep_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_delivered_by_users_id_fk" FOREIGN KEY ("delivered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_assignments" ADD CONSTRAINT "design_assignments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_assignments" ADD CONSTRAINT "design_assignments_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_assignments" ADD CONSTRAINT "design_assignments_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_assignments" ADD CONSTRAINT "design_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "door_types" ADD CONSTRAINT "door_types_wood_type_id_wood_types_id_fk" FOREIGN KEY ("wood_type_id") REFERENCES "public"."wood_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assets" ADD CONSTRAINT "employee_assets_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_audit_log" ADD CONSTRAINT "hr_audit_log_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_audit_log" ADD CONSTRAINT "hr_audit_log_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_audit_log" ADD CONSTRAINT "hr_audit_log_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_installed_by_users_id_fk" FOREIGN KEY ("installed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_inventory_id_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_zones" ADD CONSTRAINT "marketing_zones_rep_id_users_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stages" ADD CONSTRAINT "production_stages_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stages" ADD CONSTRAINT "production_stages_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_checks" ADD CONSTRAINT "quality_checks_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_checks" ADD CONSTRAINT "quality_checks_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_design_files" ADD CONSTRAINT "survey_design_files_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_design_files" ADD CONSTRAINT "survey_design_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;