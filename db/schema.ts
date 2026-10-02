import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";

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
