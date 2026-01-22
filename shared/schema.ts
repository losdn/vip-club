import { pgTable, text, serial, integer, boolean, timestamp, json } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===

// Users (Chatters and Admins)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(), // Email or Login
  password: text("password").notNull(), // Hashed
  name: text("name").notNull(),
  avatar: text("avatar"),
  role: text("role", { enum: ["dev", "admin", "supervisor", "chatter"] }).notNull().default("chatter"),
  chatGroup: text("chat_group"), // Flexible string: "Chat 1", "Chat 2", etc.
  active: boolean("active").default(true),
  lastActiveAt: timestamp("last_active_at"),
  currentModelId: integer("current_model_id").references(() => models.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Models (The accounts being managed)
export const models = pgTable("models", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  platformEmail: text("platform_email").notNull(), // Privacy.com.br email
  platformPassword: text("platform_password").notNull(), // Privacy.com.br password (encrypted ideally)
  avatar: text("avatar"), // URL to avatar image
  cover: text("cover"), // URL da imagem de capa (fundo dos cards)
  status: text("status", { enum: ["active", "inactive"] }).default("active"),
  chatGroup: text("chat_group"), // Flexible string: "Chat 1", "Chat 2", etc.
  proxyUrl: text("proxy_url"), // Proxy URL: http://user:pass@host:port
  isValidated: boolean("is_validated").default(false), // Indicates if browser cookies are valid
  createdAt: timestamp("created_at").defaultNow(),
});

// Permissions (Which chatter can access which model)
export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),
  chatterId: integer("chatter_id").notNull().references(() => users.id),
  modelId: integer("model_id").notNull().references(() => models.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Access Logs (History of who accessed what)
export const accessLogs = pgTable("access_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  modelId: integer("model_id").notNull().references(() => models.id),
  userRole: text("user_role").notNull(),
  userName: text("user_name").notNull(),
  modelName: text("model_name").notNull(),
  chatGroup: text("chat_group"),
  timestamp: timestamp("timestamp").defaultNow(),
});

// System Logs (Activity of the system/devs)
export const systemLogs = pgTable("system_logs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // info, warning, error, reset, maintenance
  message: text("message").notNull(),
  userName: text("user_name"),
  role: text("role"),
  timestamp: timestamp("timestamp").defaultNow(),
});

// System Settings (Global flags)
export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(), // e.g. "maintenance_mode"
  value: text("value").notNull(), // e.g. "true", "false"
});

// Support Messages (Chatter <-> Staff)
export const supportMessages = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull().references(() => users.id),
  chatterId: integer("chatter_id").notNull().references(() => users.id), // The "owner" of the support thread
  content: text("content"),
  attachmentUrl: text("attachment_url"),
  attachmentType: text("attachment_type").default("text"), // text, image, audio, video, file
  createdAt: timestamp("created_at").defaultNow(),
  read: boolean("read").default(false),
});

// Session Store (connect-pg-simple)
export const session = pgTable("session", {
  sid: text("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

// Devices (Hardware/Install tracking)
export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  deviceId: text("device_id").notNull().unique(),
  userId: integer("user_id").references(() => users.id),
  deviceName: text("device_name"),
  lastIp: text("last_ip"),
  location: text("location"),
  status: text("status").notNull().default('active'), // 'active', 'blocked'
  lastActiveAt: timestamp("last_active_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Blocked IPs
export const blockedIps = pgTable("blocked_ips", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull().unique(),
  reason: text("reason"),
  blockedBy: integer("blocked_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Connection Logs (IP history)
export const connectionLogs = pgTable("connection_logs", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull(),
  deviceId: text("device_id"),
  userId: integer("user_id").references(() => users.id),
  username: text("username"),
  location: text("location"),
  userAgent: text("user_agent"),
  blocked: boolean("blocked").default(false),
  timestamp: timestamp("timestamp").defaultNow(),
});

// === RELATIONS ===
export const devicesRelations = relations(devices, ({ one }) => ({
  user: one(users, {
    fields: [devices.userId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  permissions: many(permissions),
  devices: many(devices),
  supportMessagesSent: many(supportMessages, { relationName: "sender" }),
  supportThreads: many(supportMessages, { relationName: "threadOwner" }),
}));

export const supportMessagesRelations = relations(supportMessages, ({ one }) => ({
  sender: one(users, {
    fields: [supportMessages.senderId],
    references: [users.id],
    relationName: "sender"
  }),
  chatter: one(users, {
    fields: [supportMessages.chatterId],
    references: [users.id],
    relationName: "threadOwner"
  }),
}));

export const modelsRelations = relations(models, ({ many }) => ({
  permissions: many(permissions),
}));

export const permissionsRelations = relations(permissions, ({ one }) => ({
  chatter: one(users, {
    fields: [permissions.chatterId],
    references: [users.id],
  }),
  model: one(models, {
    fields: [permissions.modelId],
    references: [models.id],
  }),
}));

// === BASE SCHEMAS ===
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertModelSchema = createInsertSchema(models).omit({ id: true, createdAt: true });
export const insertPermissionSchema = createInsertSchema(permissions).omit({ id: true, createdAt: true });
export const insertAccessLogSchema = createInsertSchema(accessLogs).omit({ id: true, timestamp: true });
export const insertSystemLogSchema = createInsertSchema(systemLogs).omit({ id: true, timestamp: true });
export const insertSupportMessageSchema = createInsertSchema(supportMessages).omit({ id: true, createdAt: true, read: true });
export const insertBlockedIpSchema = createInsertSchema(blockedIps).omit({ id: true, createdAt: true });
export const insertConnectionLogSchema = createInsertSchema(connectionLogs).omit({ id: true, timestamp: true });
export const insertDeviceSchema = createInsertSchema(devices).omit({ id: true, createdAt: true, lastActiveAt: true });

// === EXPLICIT API CONTRACT TYPES ===

// Users
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUserRequest = Partial<InsertUser>;

// Models
export type Model = typeof models.$inferSelect;
export type InsertModel = z.infer<typeof insertModelSchema>;
export type UpdateModelRequest = Partial<InsertModel>;

// Permissions
export type Permission = typeof permissions.$inferSelect;
export type InsertPermission = z.infer<typeof insertPermissionSchema>;

// Access Logs
export type AccessLog = typeof accessLogs.$inferSelect;
export type InsertAccessLog = z.infer<typeof insertAccessLogSchema>;

// System Logs
export type SystemLog = typeof systemLogs.$inferSelect;
export type InsertSystemLog = z.infer<typeof insertSystemLogSchema>;

// Blocked IPs
export type BlockedIp = typeof blockedIps.$inferSelect;
export type InsertBlockedIp = z.infer<typeof insertBlockedIpSchema>;

// Connection Logs
export type ConnectionLog = typeof connectionLogs.$inferSelect;
export type InsertConnectionLog = z.infer<typeof insertConnectionLogSchema>;

// Devices
export type Device = typeof devices.$inferSelect;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;

// Support Messages
export type SupportMessage = typeof supportMessages.$inferSelect;
export type InsertSupportMessage = z.infer<typeof insertSupportMessageSchema>;

// Responses
export type UserResponse = Omit<User, "password">;
export type ModelResponse = Omit<Model, "platformPassword">; // Hide sensitive data
export type LoginResponse = UserResponse;
export type PermissionResponse = Permission & { model?: ModelResponse, chatter?: UserResponse };

// Automation Status
export interface AutomationStatus {
  status: "success" | "failed" | "processing";
  message: string;
  screenshotUrl?: string; // Proof of login
}
