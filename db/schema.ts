// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
export {};
import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const orders=sqliteTable('orders',{
  id:text('id').primaryKey(),owner:text('owner').notNull(),patient:text('patient').notNull(),reference:text('reference').notNull().default(''),upc:text('upc').notNull().default(''),lab:text('lab').notNull().default(''),orderedOn:text('ordered_on').notNull().default(''),dueOn:text('due_on').notNull().default(''),status:text('status').notNull().default('Received'),notes:text('notes').notNull().default(''),version:integer('version').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('idx_orders_owner_updated').on(t.owner,t.updatedAt),index('idx_orders_owner_status').on(t.owner,t.status),uniqueIndex('idx_orders_owner_reference').on(t.owner,t.reference).where(sql`${t.reference} <> ''`)]);
export const history=sqliteTable('order_history',{id:text('id').primaryKey(),owner:text('owner').notNull(),orderId:text('order_id').notNull().references(()=>orders.id),status:text('status').notNull(),message:text('message').notNull(),createdAt:text('created_at').notNull()},t=>[index('idx_history_owner_order').on(t.owner,t.orderId,t.createdAt)]);
export const batches=sqliteTable('batches',{id:text('id').primaryKey(),owner:text('owner').notNull(),name:text('name').notNull(),status:text('status').notNull().default('open'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()},t=>[index('idx_batches_owner_updated').on(t.owner,t.updatedAt)]);
export const codes=sqliteTable('batch_codes',{id:text('id').primaryKey(),batchId:text('batch_id').notNull().references(()=>batches.id),owner:text('owner').notNull(),code:text('code').notNull(),codeKey:text('code_key').notNull(),done:integer('done').notNull().default(0),createdAt:text('created_at').notNull()},t=>[uniqueIndex('idx_codes_batch_key').on(t.batchId,t.codeKey),index('idx_codes_owner_batch').on(t.owner,t.batchId)]);
