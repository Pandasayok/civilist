import {sql} from "drizzle-orm";
import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const content = sqliteTable("content", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), body: text("body").notNull(),
  status: text("status").notNull().default("published"), updatedAt: text("updated_at").notNull(),
}, t => [index("idx_content_kind_status").on(t.kind, t.status)]);
export const metadata = sqliteTable("metadata", {key:text("key").primaryKey(),value:text("value").notNull()});
export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(), name: text("name").notNull().default("Софья"),
  goal: integer("goal").notNull().default(50),
});
export const events = sqliteTable("events", {
  id: text("id").primaryKey(), userId:text("user_id").notNull(),kind:text("kind").notNull(),
  targetId:text("target_id").notNull(), answer:text("answer").notNull(), correct:integer("correct"),
  xp:integer("xp").notNull().default(0), day:text("day").notNull(), createdAt:text("created_at").notNull(),
},t=>[index("idx_events_user_day").on(t.userId,t.day),index("idx_events_user_target").on(t.userId,t.kind,t.targetId)]);
export const reviews = sqliteTable("reviews", {
  userId:text("user_id").notNull(),cardId:text("card_id").notNull(),level:integer("level").notNull().default(0),
  dueAt:text("due_at").notNull(),rating:text("rating").notNull(),
},t=>[primaryKey({columns:[t.userId,t.cardId]})]);
export const bookmarks = sqliteTable("bookmarks", {
  userId:text("user_id").notNull(),itemId:text("item_id").notNull(),
},t=>[primaryKey({columns:[t.userId,t.itemId]})]);

export const assessmentAttempts = sqliteTable("assessment_attempts", {
 id:text("id").primaryKey(),userId:text("user_id").notNull(),targetKey:text("target_key").notNull(),
 mode:text("mode").notNull(),branchId:text("branch_id").notNull(),target:text("target").notNull(),title:text("title").notNull(),
 questions:text("questions").notNull(),answers:text("answers").notNull().default("{}"),result:text("result"),status:text("status").notNull().default("active"),
 createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},t=>[uniqueIndex("assessment_one_active").on(t.userId,t.targetKey).where(sql`${t.status}='active'`),index("assessment_history").on(t.userId,t.targetKey,t.status)]);
