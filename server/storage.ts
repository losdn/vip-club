import { db } from "./db";
import {
  users, models, permissions, accessLogs, systemLogs, systemSettings, supportMessages, blockedIps, connectionLogs, devices,
  type User, type InsertUser,
  type Model, type InsertModel, type UpdateModelRequest,
  type Permission, type InsertPermission,
  type AccessLog, type InsertAccessLog,
  type SystemLog, type InsertSystemLog,
  type SupportMessage, type InsertSupportMessage,
  type InsertConnectionLog, type ConnectionLog,
  type InsertBlockedIp, type BlockedIp,
  type Device, type InsertDevice
} from "@shared/schema";
import { eq, and, gt, desc, asc, sql, notInArray, inArray } from "drizzle-orm";

export interface IStorage {
  // Usuários (Chatters/Admins)
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User>;
  deleteUser(id: number): Promise<void>;

  // Modelos (Contas das Plataformas)
  getModel(id: number): Promise<Model | undefined>;
  createModel(model: InsertModel): Promise<Model>;
  getModels(): Promise<Model[]>;
  updateModel(id: number, model: UpdateModelRequest): Promise<Model>;
  deleteModel(id: number): Promise<void>;

  // Permissões (Vínculos Chatter-Modelo)
  getPermissions(): Promise<any[]>;
  getPermissionsByChatter(chatterId: number): Promise<Permission[]>;
  createPermission(permission: InsertPermission): Promise<Permission>;
  deletePermission(id: number): Promise<void>;
  
  getModelsForChatter(chatterId: number): Promise<Model[]>;

  // Support Messages
  getSupportMessages(chatterId: number): Promise<any[]>;
  createSupportMessage(message: InsertSupportMessage): Promise<SupportMessage>;
  getSupportThreads(): Promise<{chatterId: number, lastMessage: SupportMessage, unreadCount: number}[]>;
  getUnreadSupportCountForChatter(chatterId: number): Promise<number>;
  markSupportMessagesAsReadByChatter(chatterId: number): Promise<void>;

  // Access Logs
  createAccessLog(log: InsertAccessLog): Promise<AccessLog>;
  getRecentAccessLogs(hours?: number): Promise<AccessLog[]>;
  getAccessLogsByRange(start?: Date, end?: Date): Promise<AccessLog[]>;
  resetAccessLogsForMonth(): Promise<void>;

  // System Logs
  createSystemLog(log: InsertSystemLog): Promise<SystemLog>;
  getSystemLogs(limit?: number): Promise<SystemLog[]>;
  resetSystemLogs(): Promise<void>;
  
  // System Settings
  getSystemSetting(key: string): Promise<string | undefined>;
  setSystemSetting(key: string, value: string): Promise<void>;
  
  // IP & Security
  isIpBlocked(ip: string): Promise<boolean>;
  blockIp(data: InsertBlockedIp): Promise<BlockedIp>;
  unblockIp(ip: string): Promise<void>;
  getBlockedIps(): Promise<BlockedIp[]>;
  logConnection(data: InsertConnectionLog): Promise<ConnectionLog>;
  getConnectionLogs(limit?: number): Promise<ConnectionLog[]>;

  // Devices
  getDevice(deviceId: string): Promise<Device | undefined>;
  createDevice(device: InsertDevice): Promise<Device>;
  updateDevice(deviceId: string, data: Partial<Device>): Promise<Device>;
  getDevices(): Promise<Device[]>;

  sessionStore: any;
}

export class DatabaseStorage implements IStorage {
  sessionStore: any;

  // --- DEVICES ---
  async getDevice(deviceId: string): Promise<Device | undefined> {
    const [device] = await db.select().from(devices).where(eq(devices.deviceId, deviceId));
    return device;
  }

  async createDevice(device: InsertDevice): Promise<Device> {
    const [newDevice] = await db.insert(devices).values(device).returning();
    return newDevice;
  }

  async updateDevice(deviceId: string, data: Partial<Device>): Promise<Device> {
    const [updated] = await db.update(devices)
      .set(data)
      .where(eq(devices.deviceId, deviceId))
      .returning();
    return updated;
  }

  async getDevices(): Promise<Device[]> {
    return await db.select().from(devices).orderBy(desc(devices.lastActiveAt));
  }

  // --- IP & SECURITY ---
  async isIpBlocked(ip: string): Promise<boolean> {
    const [blocked] = await db.select().from(blockedIps).where(eq(blockedIps.ip, ip));
    return !!blocked;
  }

  async blockIp(data: InsertBlockedIp): Promise<BlockedIp> {
    const [blocked] = await db.insert(blockedIps).values(data).returning();
    // Update existing connection log to reflect blocked status
    await db.update(connectionLogs).set({ blocked: true }).where(eq(connectionLogs.ip, data.ip));
    return blocked;
  }

  async unblockIp(ip: string): Promise<void> {
    await db.delete(blockedIps).where(eq(blockedIps.ip, ip));
    // Update existing connection log to reflect unblocked status
    await db.update(connectionLogs).set({ blocked: false }).where(eq(connectionLogs.ip, ip));
  }

  async getBlockedIps(): Promise<BlockedIp[]> {
    return await db.select().from(blockedIps).orderBy(desc(blockedIps.createdAt));
  }

  async logConnection(data: InsertConnectionLog): Promise<ConnectionLog> {
    // Check if IP/Device combo already exists to avoid spamming logs? 
    // Actually, connection logs usually track history. 
    // But the current implementation seems to update existing record if IP matches?
    // "const [existing] = await db.select().from(connectionLogs).where(eq(connectionLogs.ip, data.ip));"
    // This logic seems to only keep the LATEST log per IP. 
    // If we want history, we should insert. 
    // But let's stick to existing logic for now and just add deviceId support.
    
    // If we have a deviceId, we might want to check that too?
    // For now, let's just update the record with the deviceId if provided.
    
    const [existing] = await db.select().from(connectionLogs).where(eq(connectionLogs.ip, data.ip));
    
    if (existing) {
      // Update existing record
      const [updated] = await db.update(connectionLogs)
        .set({
          timestamp: new Date(),
          userId: data.userId,
          username: data.username,
          location: data.location,
          userAgent: data.userAgent,
          blocked: data.blocked,
          deviceId: data.deviceId || existing.deviceId // Keep existing if not provided
        })
        .where(eq(connectionLogs.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new record
      const [log] = await db.insert(connectionLogs).values(data).returning();
      return log;
    }
  }

  async getConnectionLogs(limit = 100): Promise<ConnectionLog[]> {
    return await db.select().from(connectionLogs).orderBy(desc(connectionLogs.timestamp)).limit(limit);
  }

  // --- USUÁRIOS ---
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const userData = { ...insertUser, role: insertUser.role || 'chatter' };
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user;
  }

  async deleteUser(id: number): Promise<void> {
    // 1. Remover permissões associadas
    await db.delete(permissions).where(eq(permissions.chatterId, id));
    // 2. Remover logs de acesso
    await db.delete(accessLogs).where(eq(accessLogs.userId, id));
    // 3. Remover usuário
    await db.delete(users).where(eq(users.id, id));
  }

  // --- MODELOS ---
  async getModel(id: number): Promise<Model | undefined> {
    const [model] = await db.select().from(models).where(eq(models.id, id));
    return model;
  }

  async createModel(insertModel: InsertModel): Promise<Model> {
    const [model] = await db.insert(models).values(insertModel).returning();
    return model;
  }

  async getModels(): Promise<Model[]> {
    return await db.select().from(models);
  }

  async updateModel(id: number, updates: UpdateModelRequest): Promise<Model> {
    const [model] = await db.update(models).set(updates).where(eq(models.id, id)).returning();
    return model;
  }

  async deleteModel(id: number): Promise<void> {
    // 1. Remover permissões
    await db.delete(permissions).where(eq(permissions.modelId, id));
    // 2. Remover logs
    await db.delete(accessLogs).where(eq(accessLogs.modelId, id));
    // 3. Desvincular de usuários ativos
    await db.update(users).set({ currentModelId: null }).where(eq(users.currentModelId, id));
    // 4. Remover modelo
    await db.delete(models).where(eq(models.id, id));
  }

  // --- PERMISSÕES (CORRIGIDO) ---
  async getPermissions(): Promise<any[]> {
  // 1. Buscamos os dados fazendo a união (Join) das tabelas
  // Verifique se os nomes 'users' e 'models' estão corretos no seu schema.ts
  const result = await db.select({
    id: permissions.id,
    chatterId: permissions.chatterId,
    modelId: permissions.modelId,
    createdAt: permissions.createdAt,
    // Pegamos os dados completos dos Usuários e Modelos (incluindo avatares)
    uName: users.name,
    uUsername: users.username,
    uAvatar: users.avatar,
    mName: models.name,
    mAvatar: models.avatar
  })
  .from(permissions)
  .leftJoin(users, eq(permissions.chatterId, users.id))
  .leftJoin(models, eq(permissions.modelId, models.id));

  // 2. Mapeamos para o formato que o componente da Tabela espera
  return result.map(p => {
    const displayName = p.uName || p.uUsername || "Usuário";
    
    return {
      id: p.id,
      chatterId: p.chatterId,
      modelId: p.modelId,
      createdAt: p.createdAt,
      // Enviamos das duas formas para não ter erro de leitura no Frontend
      chatterName: displayName, 
      modelName: p.mName || "Modelo",
      // Objeto aninhado (o React costuma usar esse para a bolinha/avatar)
      chatter: {
        id: p.chatterId,
        name: displayName,
        avatar: p.uAvatar || null
      },
      model: {
        id: p.modelId,
        name: p.mName || "Modelo",
        avatar: p.mAvatar  // Incluindo o avatar da modelo
      }
    };
  });
}

  async getPermissionsByChatter(chatterId: number): Promise<Permission[]> {
    return await db.select().from(permissions).where(eq(permissions.chatterId, chatterId));
  }

  async createPermission(insertPermission: InsertPermission): Promise<Permission> {
    const [existing] = await db.select().from(permissions).where(
      and(
        eq(permissions.chatterId, insertPermission.chatterId),
        eq(permissions.modelId, insertPermission.modelId)
      )
    );

    if (existing) return existing;

    const [perm] = await db.insert(permissions).values(insertPermission).returning();
    return perm;
  }

  async deletePermission(id: number): Promise<void> {
    await db.delete(permissions).where(eq(permissions.id, id));
  }

  async getModelsForChatter(chatterId: number): Promise<Model[]> {
    // Retorna todos os modelos que o chatter tem permissão, via JOIN direto
    const result = await db.select({
      id: models.id,
      name: models.name,
      platformEmail: models.platformEmail,
      platformPassword: models.platformPassword,
      avatar: models.avatar,
      cover: models.cover,
      status: models.status,
      chatGroup: models.chatGroup,
      proxyUrl: models.proxyUrl,
      isValidated: models.isValidated,
      createdAt: models.createdAt
    })
    .from(models)
    .innerJoin(permissions, eq(models.id, permissions.modelId))
    .where(eq(permissions.chatterId, chatterId));
    
    return result;
  }

  // --- SUPPORT MESSAGES ---
  async getSupportMessages(chatterId: number): Promise<any[]> {
    return await db.select({
      id: supportMessages.id,
      senderId: supportMessages.senderId,
      chatterId: supportMessages.chatterId,
      content: supportMessages.content,
      attachmentUrl: supportMessages.attachmentUrl,
      attachmentType: supportMessages.attachmentType,
      createdAt: supportMessages.createdAt,
      read: supportMessages.read,
      senderName: users.name
    })
      .from(supportMessages)
      .leftJoin(users, eq(supportMessages.senderId, users.id))
      .where(eq(supportMessages.chatterId, chatterId))
      .orderBy(asc(supportMessages.createdAt));
  }

  async createSupportMessage(message: InsertSupportMessage): Promise<SupportMessage> {
    const [msg] = await db.insert(supportMessages).values(message).returning();
    return msg;
  }

  async markSupportMessagesAsRead(chatterId: number): Promise<void> {
    await db.update(supportMessages)
      .set({ read: true })
      .where(and(
        eq(supportMessages.chatterId, chatterId),
        eq(supportMessages.senderId, chatterId),
        eq(supportMessages.read, false)
      ));
  }

  async markSupportMessagesAsReadByChatter(chatterId: number): Promise<void> {
    await db.update(supportMessages)
      .set({ read: true })
      .where(and(
        eq(supportMessages.chatterId, chatterId),
        sql`${supportMessages.senderId} <> ${chatterId}`,
        eq(supportMessages.read, false)
      ));
  }

  async getSupportThreads(): Promise<{chatterId: number, lastMessage: SupportMessage, unreadCount: number}[]> {
    // Get all unique chatterIds that have messages
    const distinctChatters = await db.selectDistinct({ id: supportMessages.chatterId })
        .from(supportMessages);
    
    const threads = [];
    
    for (const { id } of distinctChatters) {
      if (!id) continue;
      
      const messages = await db.select()
        .from(supportMessages)
        .where(eq(supportMessages.chatterId, id))
        .orderBy(desc(supportMessages.createdAt))
        .limit(1);
        
      if (messages.length > 0) {
        const unread = await db.select({ count: sql<number>`count(*)` })
            .from(supportMessages)
            .where(and(
                eq(supportMessages.chatterId, id),
                eq(supportMessages.senderId, id),
                eq(supportMessages.read, false)
            ));
            
        threads.push({
            chatterId: id,
            lastMessage: messages[0],
            unreadCount: Number(unread[0].count)
        });
      }
    }
    
    return threads.sort((a, b) => b.lastMessage.createdAt!.getTime() - a.lastMessage.createdAt!.getTime());
  }

  async getUnreadSupportCountForChatter(chatterId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(supportMessages)
      .where(and(
        eq(supportMessages.chatterId, chatterId),
        sql`${supportMessages.senderId} <> ${chatterId}`,
        eq(supportMessages.read, false)
      ));
    return Number(result[0]?.count || 0);
  }

  // --- COUNTS & OPTIMIZED STATS ---
  async getCounts(): Promise<{ users: number, models: number, permissions: number }> {
    try {
      const [usersCount] = await db.select({ count: sql<number | string>`count(*)` }).from(users);
      const [modelsCount] = await db.select({ count: sql<number | string>`count(*)` }).from(models);
      const [permsCount] = await db.select({ count: sql<number | string>`count(*)` }).from(permissions);

      const parse = (val: { count: number | string } | undefined) => {
        if (!val) return 0;
        const num = Number(val.count);
        return isNaN(num) ? 0 : num;
      };

      const result = {
        users: parse(usersCount),
        models: parse(modelsCount),
        permissions: parse(permsCount)
      };
      
      return result;
    } catch (e) {
      console.error("[Storage] Error getting counts:", e);
      return { users: 0, models: 0, permissions: 0 };
    }
  }

  async getEnrichedAccessLogs(start?: Date, end?: Date, limit = 100): Promise<any[]> {
    let whereClause: any = inArray(accessLogs.userRole, ["chatter", "supervisor"]);

    if (start && end) {
      whereClause = and(
        whereClause,
        gt(accessLogs.timestamp, start),
        sql`${accessLogs.timestamp} <= ${end}`
      );
    } else if (start) {
      whereClause = and(whereClause, gt(accessLogs.timestamp, start));
    } else if (end) {
      whereClause = and(whereClause, sql`${accessLogs.timestamp} <= ${end}`);
    }

    const result = await db.select({
      id: accessLogs.id,
      timestamp: accessLogs.timestamp,
      userId: accessLogs.userId,
      modelId: accessLogs.modelId,
      userRole: accessLogs.userRole,
      userName: users.name,
      userUsername: users.username,
      modelName: models.name
    })
    .from(accessLogs)
    .leftJoin(users, eq(accessLogs.userId, users.id))
    .leftJoin(models, eq(accessLogs.modelId, models.id))
    .where(whereClause)
    .orderBy(desc(accessLogs.timestamp))
    .limit(limit);

    return result.map(log => ({
      ...log,
      userName: log.userName || log.userUsername,
      // Ensure compatibility with previous response format
      modelName: log.modelId ? log.modelName : undefined
    }));
  }

  // --- ACCESS LOGS ---
  async createAccessLog(log: InsertAccessLog): Promise<AccessLog> {
    const [entry] = await db.insert(accessLogs).values(log).returning();
    return entry;
  }

  async getRecentAccessLogs(hours = 48): Promise<AccessLog[]> {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const rows = await db.select()
      .from(accessLogs)
      .where(
        and(
          gt(accessLogs.timestamp, cutoff),
          inArray(accessLogs.userRole, ["chatter", "supervisor"])
        )
      )
      .orderBy(desc(accessLogs.timestamp));
    return rows.filter(log => log.modelId !== null && log.modelId !== undefined);
  }

  async getAccessLogsByRange(start?: Date, end?: Date): Promise<AccessLog[]> {
    let whereClause: any = inArray(accessLogs.userRole, ["chatter", "supervisor"]);

    if (start && end) {
      const timeClause = and(
        gt(accessLogs.timestamp, start),
        sql`${accessLogs.timestamp} <= ${end}`
      );
      whereClause = and(whereClause, timeClause);
    } else if (start) {
      const timeClause = gt(accessLogs.timestamp, start);
      whereClause = and(whereClause, timeClause);
    } else if (end) {
      const timeClause = sql`${accessLogs.timestamp} <= ${end}`;
      whereClause = and(whereClause, timeClause);
    }

    const query = db.select().from(accessLogs);
    const result = await query.where(whereClause).orderBy(desc(accessLogs.timestamp));
    return result.filter(log => log.modelId !== null && log.modelId !== undefined);
  }

  async resetAccessLogsForMonth(): Promise<void> {
    await db.delete(accessLogs);
  }

  // --- SYSTEM LOGS ---
  async createSystemLog(log: InsertSystemLog): Promise<SystemLog> {
    const [entry] = await db.insert(systemLogs).values(log).returning();
    return entry;
  }

  async getSystemLogs(limit = 50): Promise<SystemLog[]> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    await db.delete(systemLogs).where(sql`${systemLogs.timestamp} < ${startOfMonth}`);

    const rows = await db.select()
      .from(systemLogs)
      .where(inArray(systemLogs.role, ["chatter", "supervisor"]))
      .orderBy(desc(systemLogs.timestamp))
      .limit(limit);

    return rows.filter((log) => {
      const msg = (log.message || "").toLowerCase();
      if (!msg) return false;
      if (msg.includes("suporte")) return false;
      return true;
    });
  }

  async resetSystemLogs(): Promise<void> {
    await db.delete(systemLogs);
  }

  // --- SYSTEM SETTINGS ---
  async getSystemSetting(key: string): Promise<string | undefined> {
    const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return setting?.value;
  }

  async setSystemSetting(key: string, value: string): Promise<void> {
    await db.insert(systemSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value } });
  }
}

export const storage = new DatabaseStorage();
