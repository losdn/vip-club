
import type { Express } from "express";
import { type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { storage } from "./storage";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { pool } from "./db";
import { insertUserSchema, insertModelSchema, insertPermissionSchema, insertSupportMessageSchema } from "@shared/schema";
// Imports kept from original file
import { startAutomationSession } from "./automation";
import { openSupervisorBrowser, robustStartSession, openMonitorBrowser, clearSessionData, getChatContent } from "./robust-automation";
import { resourceManager } from "./resource-manager";
import fs from "fs/promises";
import path from "path";

// DEBUG LOG TO CONFIRM NEW CODE LOADED
console.log("---------------------------------------------------");
console.log("!!! SERVER ROUTES LOADED - DEBUG VERSION 2026-01-13 !!!");
console.log("---------------------------------------------------");

const log = (msg: string) => console.log(`${new Date().toLocaleTimeString()} [express] ${msg}`);
const PgSession = pgSession(session);

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

export { resourceManager };

export function resetSystemActivity() {
  log("System activity reset triggered (handled by database)");
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const sessionStore = new PgSession({
    pool,
    createTableIfMissing: true
  });

  const sessionMiddleware = session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || "vip_club_secret_key_fixed",
    resave: true,
    saveUninitialized: false,
    name: 'vip_club_session',
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
      sameSite: 'lax',
      path: '/'
    },
    rolling: false
  });

  app.use(sessionMiddleware);

  // --- SOCKET.IO SETUP ---
  const io = new SocketIOServer(httpServer, {
    path: "/socket.io",
    cors: {
        origin: true,
        credentials: true
    }
  });

  // Share session with socket.io
  const wrap = (middleware: any) => (socket: any, next: any) => middleware(socket.request, {}, next);
  io.use(wrap(sessionMiddleware));

  io.on("connection", async (socket) => {
    const sess = (socket.request as any).session;
    const userId = sess?.userId;
    if (!userId) {
        console.log(new Date().toISOString(), "[socket] disconnecting: no session userId");
        socket.disconnect();
        return;
    }

    const user = await storage.getUser(userId);
    if (!user) {
        console.log(new Date().toISOString(), "[socket] disconnecting: user not found for id", userId);
        socket.disconnect();
        return;
    }

    // Join own room (for receiving messages)
    socket.join(`user_${userId}`);
    
    // Join staff room if applicable
    if (["admin", "supervisor", "dev"].includes(user.role)) {
        socket.join("support_staff");
    }

    // Handle sending messages
    socket.on("send_support_message", async (data: { content?: string, attachmentUrl?: string, attachmentType?: string, chatterId?: number }) => {
        try {
            // Determine chatterId (thread owner)
            let chatterId = user.id;
            
            // If staff is sending, they must provide chatterId (the recipient)
            if (["admin", "supervisor", "dev"].includes(user.role)) {
                if (!data.chatterId) return; // Error: Staff must specify recipient
                chatterId = data.chatterId;
            } else {
                // If chatter is sending, they are the thread owner
                chatterId = user.id;
            }

            const msg = await storage.createSupportMessage({
                senderId: user.id,
                chatterId: chatterId,
                content: data.content,
                attachmentUrl: data.attachmentUrl,
                attachmentType: data.attachmentType
            });

            // Add sender name for UI display
            const msgWithSender = { ...msg, senderName: user.name };

            // Emit to chatter (thread owner)
            io.to(`user_${chatterId}`).emit("new_support_message", msgWithSender);
            
            // Emit to staff
            io.to("support_staff").emit("new_support_message", msgWithSender);
            
        } catch (e) {
            console.error("[Socket] Error sending message:", e);
        }
    });

    // Handle Chat Presence (Join/Leave)
    socket.on("join_chat", async (data: { targetId?: number }) => {
        try {
            const currentUser = await storage.getUser(userId);
            if (!currentUser) return;

            let message = "";
            let targetName = "";

            if (["admin", "supervisor", "dev"].includes(currentUser.role)) {
                if (data.targetId) {
                    const targetUser = await storage.getUser(data.targetId);
                    if (targetUser) {
                        targetName = targetUser.name;
                        message = `entrou no chat de ${targetName}`;
                    }
                }
            } else {
                // Chatter entering their own support
                message = `entrou no chat de Suporte`;
            }

            if (message) {
                 await storage.createSystemLog({
                    type: "info",
                    message: message,
                    userName: currentUser.name,
                    role: currentUser.role
                });
            }
        } catch (e) {
            console.error("[Socket] Error in join_chat:", e);
        }
    });

    socket.on("leave_chat", async (data: { targetId?: number }) => {
        try {
            const currentUser = await storage.getUser(userId);
            if (!currentUser) return;

            let message = "";
            let targetName = "";

            if (["admin", "supervisor", "dev"].includes(currentUser.role)) {
                if (data.targetId) {
                    const targetUser = await storage.getUser(data.targetId);
                    if (targetUser) {
                        targetName = targetUser.name;
                        message = `saiu do chat de ${targetName}`;
                    }
                }
            } else {
                message = `saiu do chat de Suporte`;
            }

            if (message) {
                 await storage.createSystemLog({
                    type: "info",
                    message: message,
                    userName: currentUser.name,
                    role: currentUser.role
                });
            }
        } catch (e) {
            console.error("[Socket] Error in leave_chat:", e);
        }
    });
  });

  // Initial Log
  storage.createSystemLog({
    type: "system",
    message: "Sistema iniciado com sucesso",
    userName: "Sistema",
    role: "system"
  });

  // Auth Middleware
  const requireAuth = async (req: any, res: any, next: any) => {
    if (!req.session.userId) {
      log(`[Auth] Rejected: No session userId. SessionID: ${req.sessionID}`);
      return res.status(401).json({ message: "Não autorizado: Sessão inválida ou expirada" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      log(`[Auth] Rejected: User not found for ID ${req.session.userId}`);
      return res.status(401).json({ message: "Não autorizado: Usuário não encontrado" });
    }
    try {
      await storage.updateUser(user.id, { lastActiveAt: new Date() as any });
    } catch (e) {
      console.error("[Auth] Failed to update lastActiveAt", e);
    }
    req.currentUser = user;
    next();
  };

  const requireRole = (roles: Array<"dev" | "admin" | "supervisor" | "chatter">) => {
    return async (req: any, res: any, next: any) => {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
         log(`[Auth] Role Check Failed: User not found`);
         return res.status(401).json({ message: "Usuário não encontrado" });
      }
      
      if (!roles.includes(user.role as any)) {
        log(`[Auth] Role Check Failed: User ${user.username} (${user.role}) needed one of [${roles.join(',')}]`);
        return res.status(403).json({ message: `Acesso negado: Requer função ${roles.join(' ou ')}` });
      }
      req.currentUser = user;
      next();
    };
  };

  // --- Auth Routes ---
  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    const user = await storage.getUserByUsername(username);
    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Credenciais inválidas" });
    }
    if (!user.active) {
      return res.status(403).json({ message: "Usuário inativo" });
    }
    req.session.userId = user.id;
    await req.session.save();
    try {
      await storage.updateUser(user.id, { lastActiveAt: new Date() as any });
    } catch (e) {
      console.error("[Auth] Failed to update lastActiveAt on login", e);
    }
    
    // --- Device Association ---
    const deviceId = req.deviceId || req.headers['x-device-id'] as string;
    if (deviceId) {
         try {
             let device = await storage.getDevice(deviceId);
             
             if (device && device.status === 'blocked') {
                 // Should be caught by middleware, but just in case
                 return res.status(403).json({ message: "Dispositivo bloqueado" });
             }
             
             if (device) {
                 await storage.updateDevice(deviceId, { 
                     userId: user.id, 
                     lastActiveAt: new Date() as any
                 });
             } else {
                 await storage.createDevice({
                     deviceId: deviceId,
                     userId: user.id,
                     deviceName: `Dispositivo de ${user.username}`,
                     lastIp: req.cleanIp || 'unknown',
                     location: req.location || 'Unknown Location',
                     status: 'active'
                 });
             }
         } catch(e) {
             console.error("[Auth] Failed to associate device:", e);
         }
    }

    // Log login
    await storage.createSystemLog({
      type: "info",
      message: "Usuário logou no sistema",
      userName: user.name,
      role: user.role
    });

    res.json(user);
  });

  app.post("/api/heartbeat", requireAuth, async (req, res) => {
    // requireAuth already updates lastActiveAt, so we just return success
    res.sendStatus(200);
  });

  app.post("/api/logout", async (req, res) => {
    // Log logout if user is logged in
    if (req.session.userId) {
        try {
            const user = await storage.getUser(req.session.userId);
            if (user) {
                 await storage.createSystemLog({
                    type: "info",
                    message: "saiu do sistema",
                    userName: user.name,
                    role: user.role
                });
            }
        } catch (e) {
            console.error("[Auth] Error logging logout:", e);
        }
    }

    req.session.destroy((err) => {
      if (err) {
        log(`[Auth] Logout error: ${err}`);
        return res.status(500).json({ message: "Erro ao sair" });
      }
      res.json({ message: "Logged out" });
    });
  });

  app.post("/api/heartbeat", requireAuth, async (_req, res) => {
    res.status(204).end();
  });

  app.get("/api/user", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not logged in" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "User not found" });
    res.json(user);
  });

  // --- IP Security Routes ---
  app.get("/api/admin/blocked-ips", requireAuth, requireRole(["admin", "dev"]), async (req, res) => {
    try {
      const blocked = await storage.getBlockedIps();
      res.json(blocked);
    } catch (e) {
      console.error("[Security] Error fetching blocked IPs:", e);
      res.status(500).json({ message: "Erro ao buscar IPs bloqueados" });
    }
  });

  app.post("/api/admin/blocked-ips", requireAuth, requireRole(["admin", "dev"]), async (req, res) => {
    try {
      const { ip, reason } = req.body;
      if (!ip) return res.status(400).json({ message: "IP é obrigatório" });
      
      const blockedBy = req.session.userId;
      const result = await storage.blockIp({ ip, reason, blockedBy });
      
      log(`[Security] IP ${ip} blocked by user ${blockedBy}`);
      res.json(result);
    } catch (e: any) {
      console.error("[Security] Error blocking IP:", e);
      res.status(500).json({ message: "Erro ao bloquear IP", details: e.message });
    }
  });

  app.delete("/api/admin/blocked-ips/:ip", requireAuth, requireRole(["admin", "dev"]), async (req, res) => {
    try {
      const ip = decodeURIComponent(req.params.ip);
      await storage.unblockIp(ip);
      log(`[Security] IP ${ip} unblocked by user ${req.session.userId}`);
      res.status(204).end();
    } catch (e) {
      console.error("[Security] Error unblocking IP:", e);
      res.status(500).json({ message: "Erro ao desbloquear IP" });
    }
  });

  // --- Device Security Routes ---
  app.post("/api/admin/devices/:deviceId/block", requireAuth, requireRole(["admin", "dev"]), async (req, res) => {
    try {
      const { deviceId } = req.params;
      const { reason } = req.body;
      
      const device = await storage.getDevice(deviceId);
      if (!device) {
        // Create it if it doesn't exist? Or fail?
        // If it's in the log, it should be in the devices table if they logged in.
        // But if it was just a connection without login, maybe not?
        // Actually, logConnection is separate.
        // Let's create it if missing, assuming it's a valid ID from the log.
        await storage.createDevice({
            deviceId,
            status: 'blocked',
            deviceName: 'Dispositivo Bloqueado Manualmente',
            lastIp: 'unknown',
            location: 'unknown'
        });
      } else {
        await storage.updateDevice(deviceId, { status: 'blocked' });
      }

      log(`[Security] Device ${deviceId} blocked by user ${req.session.userId}`);
      res.json({ message: "Dispositivo bloqueado com sucesso" });
    } catch (e: any) {
      console.error("[Security] Error blocking device:", e);
      res.status(500).json({ message: "Erro ao bloquear dispositivo" });
    }
  });

  app.post("/api/admin/devices/:deviceId/unblock", requireAuth, requireRole(["admin", "dev"]), async (req, res) => {
    try {
      const { deviceId } = req.params;
      await storage.updateDevice(deviceId, { status: 'active' });
      log(`[Security] Device ${deviceId} unblocked by user ${req.session.userId}`);
      res.json({ message: "Dispositivo desbloqueado com sucesso" });
    } catch (e) {
      console.error("[Security] Error unblocking device:", e);
      res.status(500).json({ message: "Erro ao desbloquear dispositivo" });
    }
  });

  app.get("/api/admin/connection-logs", requireAuth, requireRole(["admin", "dev"]), async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const logs = await storage.getConnectionLogs(limit);
      res.json(logs);
    } catch (e) {
      console.error("[Security] Error fetching connection logs:", e);
      res.status(500).json({ message: "Erro ao buscar logs de conexão" });
    }
  });

  // --- Users Routes ---
  app.get("/api/users", requireAuth, requireRole(["dev", "admin", "supervisor"]), async (req, res) => {
    const users = await storage.getUsers();
    res.json(users);
  });

  app.post("/api/users", requireAuth, requireRole(["dev", "admin"]), async (req, res) => {
    const parsed = insertUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    const user = await storage.createUser(parsed.data);
    
    const actor = (req as any).currentUser;
    await storage.createSystemLog({
      type: "info",
      message: `Criou usuário: ${user.name} (${user.role})`,
      userName: actor?.name,
      role: actor?.role
    });
    
    res.json(user);
  });

  app.patch("/api/users/:id", requireAuth, requireRole(["dev", "admin"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      log(`[User] Updating user ${id} with: ${JSON.stringify(req.body, (k, v) => k === 'password' ? '***' : v)}`);

      // Validate with Zod
      const parsed = insertUserSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        log(`[User] Validation error: ${JSON.stringify(parsed.error)}`);
        return res.status(400).json({ message: "Dados de usuário inválidos", details: parsed.error.issues });
      }

      const user = await storage.updateUser(id, parsed.data);
      res.json(user);
    } catch (e: any) {
      console.error("[User] Error updating user:", e);
      // Ensure specific database errors (like unique constraints) are propagated
      const message = e.message || "Erro desconhecido";
      res.status(500).json({ message: "Erro ao atualizar usuário", details: message });
    }
  });

  app.delete("/api/users/:id", requireAuth, requireRole(["dev", "admin"]), async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.deleteUser(id);
    res.status(204).end();
  });

  // --- Models Routes ---
  app.get("/api/models", requireAuth, async (req, res) => {
    const models = await storage.getModels();
    res.json(models);
  });

  app.get("/api/my-models", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const user = (req as any).currentUser;
    
    if (["admin", "supervisor", "dev"].includes(user.role)) {
      const models = await storage.getModels();
      res.json(models);
    } else {
      const models = await storage.getModelsForChatter(userId);
      res.json(models);
    }
  });

  app.post("/api/models", requireAuth, requireRole(["dev", "admin"]), async (req, res) => {
    const parsed = insertModelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    const model = await storage.createModel(parsed.data);
    res.json(model);
  });

  app.patch("/api/models/:id", requireAuth, requireRole(["dev", "admin"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      log(`[Model] Updating model ${id} with: ${JSON.stringify(req.body, (k, v) => k === 'platformPassword' ? '***' : v)}`);
      
      // Validate with Zod
      const parsed = insertModelSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        log(`[Model] Validation error for update ${id}: ${JSON.stringify(parsed.error)}`);
        return res.status(400).json({ 
          message: "Dados inválidos", 
          details: parsed.error.issues 
        });
      }

      const model = await storage.updateModel(id, parsed.data);
      res.json(model);
    } catch (e: any) {
      console.error("[Model] Error updating model:", e);
      // Ensure we always return JSON
      res.status(500).json({ 
        message: "Erro ao atualizar modelo", 
        details: e.message || "Erro desconhecido no servidor" 
      });
    }
  });

  app.delete("/api/models/:id", requireAuth, requireRole(["dev", "admin"]), async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.deleteModel(id);
    res.status(204).end();
  });

  // --- Permissions Routes ---
  app.get("/api/permissions", requireAuth, requireRole(["dev", "admin", "supervisor"]), async (req, res) => {
    const perms = await storage.getPermissions();
    res.json(perms);
  });

  app.get("/api/my-permissions", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const perms = await storage.getPermissionsByChatter(userId);
    res.json(perms);
  });

  app.post("/api/permissions", requireAuth, requireRole(["dev", "admin"]), async (req, res) => {
    const parsed = insertPermissionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    const perm = await storage.createPermission(parsed.data);
    res.json(perm);
  });

  app.delete("/api/permissions/:id", requireAuth, requireRole(["dev", "admin"]), async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.deletePermission(id);
    res.status(204).end();
  });

  // --- Stats Routes ---
  app.get("/api/stats/system", requireAuth, requireRole(["dev", "admin", "supervisor"]), async (req, res) => {
    try {
      const { start, end } = req.query;
      const startDate = start ? new Date(start as string) : undefined;
      const endDate = end ? new Date(end as string) : undefined;

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const [counts, logs] = await Promise.all([
        storage.getCounts(),
        storage.getEnrichedAccessLogs(startDate, endDate)
      ]);

      res.json({
        counts,
        sessions: {
          history: logs
        }
      });
    } catch (e) {
      console.error("[Stats] Error fetching system stats:", e);
      res.status(500).json({ message: "Erro ao buscar estatísticas" });
    }
  });

  // --- Access Logs ---
  app.get("/api/access-logs", requireAuth, requireRole(["dev", "admin", "supervisor"]), async (req, res) => {
    const logs = await storage.getRecentAccessLogs(48);
    res.json(logs);
  });

  app.post("/api/access-logs/reset", requireAuth, requireRole(["dev", "admin"]), async (req, res) => {
    await storage.resetAccessLogsForMonth();
    
    const actor = (req as any).currentUser;
    await storage.createSystemLog({
      type: "reset",
      message: "Histórico de acesso resetado manualmente",
      userName: actor?.name,
      role: actor?.role
    });

    res.json({ message: "Logs resetados" });
  });

  app.post("/api/system/activity/reset", requireAuth, requireRole(["dev", "admin"]), async (req, res) => {
    await storage.resetSystemLogs();

    const actor = (req as any).currentUser;
    await storage.createSystemLog({
      type: "reset",
      message: "Atividades recentes resetadas manualmente",
      userName: actor?.name,
      role: actor?.role
    });

    res.json({ message: "Atividade resetada" });
  });

  // --- System Logs & Maintenance ---
  app.get("/api/system/activity", requireAuth, requireRole(["dev", "admin", "supervisor"]), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const logs = await storage.getSystemLogs(100);
    res.json(logs);
  });

  app.get("/api/system/maintenance", requireAuth, async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const status = await storage.getSystemSetting("maintenance_mode");
      res.json({ enabled: status === "true" });
    } catch (e) {
      console.error("[Maintenance] Error getting status:", e);
      res.status(500).json({ message: "Erro ao buscar status" });
    }
  });

  app.post("/api/system/maintenance", requireAuth, requireRole(["dev", "admin"]), async (req, res) => {
    try {
      log(`[Maintenance] Request body: ${JSON.stringify(req.body)}`);
      const { enabled } = req.body;
      const currentUser = (req as any).currentUser;
      
      log(`[Maintenance] Received request to set enabled=${enabled}. User: ${currentUser?.username} (${currentUser?.role})`);

      await storage.setSystemSetting("maintenance_mode", String(enabled));
      log(`[Maintenance] System setting updated to ${String(enabled)}.`);
      
      const logEntry = {
        type: "maintenance",
        message: enabled ? "Sistema inoperante" : "Sistema online",
        userName: currentUser?.name || "Sistema",
        role: currentUser?.role || "system",
        timestamp: new Date()
      };

      await storage.createSystemLog(logEntry);
      log(`[Maintenance] System log created.`);
      
      res.json({ message: "Status atualizado" });
    } catch (e: any) {
      console.error("[Maintenance] CRITICAL ERROR:", e);
      // Send detailed error to client
      res.status(500).json({ 
        message: "Erro ao atualizar status", 
        details: e.message || String(e) 
      });
    }
  });

  // --- Chat Routes ---
  app.get("/api/chat/:modelId/content", requireAuth, async (req, res) => {
    try {
      const modelId = parseInt(req.params.modelId);
      const model = await storage.getModel(modelId);
      const user = (req as any).currentUser;
      const isSupervisor = user?.role === "supervisor";
      if (isSupervisor && (!model || !model.isValidated)) {
        return res.status(403).send("Sessão inválida ou expirada. Valide o login desta modelo antes de visualizar o chat.");
      }
      const content = await getChatContent(modelId, req.session.userId!);
      
      if (!content) {
        return res.status(503).send("Chat indisponível no momento");
      }
      
      // Retorna o HTML diretamente
      res.send(content);
    } catch (e) {
      console.error("[Chat] Error fetching content:", e);
      res.status(500).send("");
    }
  });

  // --- Automation Routes ---
  app.post("/api/automation/start", requireAuth, async (req, res) => {
    try {
      const { modelId } = req.body;
      const userId = req.session.userId!;
      const user = (req as any).currentUser;
      const isAdmin = user.role === "admin" || user.role === "dev";
      const model = await storage.getModel(modelId);
      
      if (!model) {
        return res.status(404).json({ status: "failed", message: "Modelo não encontrada" });
      }

      // Verificação de segurança para Chatters
      if (!isAdmin) {
        // 1. Verifica se a modelo está validada
        if (!model.isValidated) {
           return res.status(403).json({ 
             status: "failed", 
             message: "Chat indisponível. A modelo precisa ser validada pelo administrador." 
           });
        }

        // 2. Verifica se o usuário tem permissão explicita
        const permissions = await storage.getPermissionsByChatter(userId);
        const hasPermission = permissions.some(p => p.modelId === modelId);
        
        if (!hasPermission) {
          return res.status(403).json({
            status: "failed",
            message: "Acesso negado. Você não tem permissão para este chat."
          });
        }
      }

      log(`[Automation] Request to start session. Model: ${modelId}, User: ${userId}, IsAdmin: ${isAdmin}`);

      const result = await robustStartSession(modelId, userId, isAdmin);

      if (result.status === "success" && model && !isAdmin) {
        try {
          await storage.createAccessLog({
            userId: user.id,
            modelId: model.id,
            userRole: user.role,
            userName: user.name,
            modelName: model.name,
            chatGroup: model.chatGroup || null
          });
        } catch (e) {
          console.error("[AccessLog] Failed to create access log for automation/start:", e);
        }

        try {
          await storage.createSystemLog({
            type: "info",
            message: `entrou no chat de ${model.name}`,
            userName: user.name,
            role: user.role
          });
        } catch (e) {
          console.error("[SystemLog] Failed to create chat entry log for automation/start:", e);
        }
      }

      if (result.status === "success") {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (e: any) {
      console.error("[Automation] Error starting session:", e);
      res.status(500).json({ status: "failed", message: e.message || "Erro interno" });
    }
  });

  app.post("/api/automation/monitor", requireAuth, requireRole(["dev", "admin", "supervisor"]), async (req, res) => {
    try {
      const { modelId } = req.body;
      const userId = req.session.userId!;
      const model = await storage.getModel(modelId);
      const user = (req as any).currentUser;
      
      if (!model) {
        return res.status(404).json({ status: "failed", message: "Modelo não encontrada" });
      }

      if (!model.isValidated) {
        return res.status(400).json({
          status: "failed",
          message: "Sessão inválida ou expirada. Valide o login desta modelo antes de monitorar."
        });
      }

      const result = await openMonitorBrowser(modelId, userId);

      if (result.status === "success" && user && model) {
        try {
          await storage.createAccessLog({
            userId: user.id,
            modelId: model.id,
            userRole: user.role,
            userName: user.name,
            modelName: model.name,
            chatGroup: model.chatGroup || null
          });
        } catch (e) {
          console.error("[AccessLog] Failed to create access log for automation/monitor:", e);
        }

        try {
          await storage.createSystemLog({
            type: "info",
            message: `entrou no chat de ${model.name}`,
            userName: user.name,
            role: user.role
          });
        } catch (e) {
          console.error("[SystemLog] Failed to create chat entry log for automation/monitor:", e);
        }
      }
      
      if (result.status === "success") {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (e: any) {
      console.error("[Monitor] Error opening monitor:", e);
      res.status(500).json({ status: "failed", message: "Erro ao abrir monitoramento" });
    }
  });

    app.patch("/api/models/:id/validate", requireAuth, requireRole(["dev", "admin"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { isValidated } = req.body;
      
      log(`[Model] Setting validation status for model ${id} to ${isValidated}`);

      if (isValidated === false) {
        log(`[Model] Invalidate requested for model ${id}. Clearing session data...`);
        try {
            await clearSessionData(id);
        } catch (error) {
            console.error(`[Model] Warning: Failed to clear session data for model ${id}`, error);
            // Non-critical error, proceed to update DB
        }
      }

      // We need to use storage to update this specific field
      // Since updateModel takes partial model, we can pass it directly
      const model = await storage.updateModel(id, { isValidated });
      
      res.json(model);
    } catch (e: any) {
      console.error("[Model] Error validating model:", e);
      res.status(500).json({ message: "Erro ao validar modelo" });
    }
  });

  // --- SYNC SESSION (Electron -> Server) ---
  app.post("/api/models/:id/sync-session", requireAuth, requireRole(["dev", "admin"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { cookies, localStorage, userAgent } = req.body;
      
      console.log(`[Sync] Recebendo dados de sessão para modelo ${id}`);
      
      const fs = await import('fs/promises');
      const path = await import('path');
      const USER_DATA_DIR = path.resolve(process.cwd(), ".user_data");
      try { await fs.mkdir(USER_DATA_DIR, { recursive: true }); } catch {}

      // 1. Salva Cookies
      if (Array.isArray(cookies) && cookies.length > 0) {
        const cookieFile = path.join(USER_DATA_DIR, `cookies_model_${id}.json`);
        await fs.writeFile(cookieFile, JSON.stringify(cookies, null, 2));
        console.log(`[Sync] Cookies salvos: ${cookies.length}`);
      }

      // 2. Salva LocalStorage
      if (localStorage) {
        const lsFile = path.join(USER_DATA_DIR, `localstorage_model_${id}.json`);
        await fs.writeFile(lsFile, JSON.stringify(localStorage, null, 2));
        console.log(`[Sync] LocalStorage salvo.`);
      }

      // 3. Salva UserAgent
      if (userAgent) {
        const uaFile = path.join(USER_DATA_DIR, `useragent_model_${id}.json`);
        await fs.writeFile(uaFile, JSON.stringify({ userAgent }, null, 2));
        console.log(`[Sync] UserAgent salvo.`);
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error("[Sync] Erro ao salvar sessão:", e);
      res.status(500).json({ message: "Erro ao salvar sessão" });
    }
  });

  // --- GET SESSION (Server -> Electron) ---
  app.get("/api/models/:id/sync-session", requireAuth, requireRole(["dev", "admin", "supervisor", "chatter"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = (req as any).currentUser;

      // Verification: Chatters can only access their own models
      if (user.role === 'chatter') {
        const myModels = await storage.getModelsForChatter(user.id);
        const hasAccess = myModels.some(m => m.id === id);
        if (!hasAccess) {
          return res.status(403).json({ message: "Acesso negado a este modelo" });
        }
      }

      const fs = await import('fs/promises');
      const path = await import('path');
      const USER_DATA_DIR = path.resolve(process.cwd(), ".user_data");
      
      const responseData: any = {
        cookies: [],
        localStorage: null,
        userAgent: null
      };

      try {
        const cookieFile = path.join(USER_DATA_DIR, `cookies_model_${id}.json`);
        const cookieContent = await fs.readFile(cookieFile, 'utf-8');
        responseData.cookies = JSON.parse(cookieContent);
      } catch (e) {}

      try {
        const lsFile = path.join(USER_DATA_DIR, `localstorage_model_${id}.json`);
        const lsContent = await fs.readFile(lsFile, 'utf-8');
        responseData.localStorage = JSON.parse(lsContent);
      } catch (e) {}

      try {
        const uaFile = path.join(USER_DATA_DIR, `useragent_model_${id}.json`);
        const uaContent = await fs.readFile(uaFile, 'utf-8');
        responseData.userAgent = JSON.parse(uaContent)?.userAgent;
      } catch (e) {}

      res.json(responseData);
    } catch (e: any) {
      console.error("[Sync] Erro ao ler sessão:", e);
      res.status(500).json({ message: "Erro ao ler sessão" });
    }
  });

  // DEPRECATED: Old cookie sync route (kept for safety)
  app.post("/api/models/:id/cookies", requireAuth, requireRole(["dev", "admin"]), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { cookies } = req.body;
      
      if (!Array.isArray(cookies)) {
        return res.status(400).json({ message: "Formato inválido de cookies" });
      }

      console.log(`[Cookies] Recebendo ${cookies.length} cookies para o modelo ${id}`);
      
      // Salva os cookies em um arquivo JSON na pasta .user_data
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Certifica que o diretório existe (importado do robust-automation ou hardcoded)
      const USER_DATA_DIR = path.resolve(process.cwd(), ".user_data");
      try { await fs.mkdir(USER_DATA_DIR, { recursive: true }); } catch {}

      const cookieFile = path.join(USER_DATA_DIR, `cookies_model_${id}.json`);
      await fs.writeFile(cookieFile, JSON.stringify(cookies, null, 2));

      console.log(`[Cookies] Salvos com sucesso em: ${cookieFile}`);
      res.json({ success: true });
    } catch (e: any) {
      console.error("[Cookies] Erro ao salvar cookies:", e);
      res.status(500).json({ message: "Erro ao salvar cookies" });
    }
  });

  // --- Support Chat Routes ---
  app.post("/api/support/message", requireAuth, async (req, res) => {
    try {
      const user = (req as any).currentUser;
      const data = req.body;
      console.log(new Date().toISOString(), "[support] incoming message", {
        hasContent: !!data.content,
        hasAttachment: !!data.attachmentUrl,
        attachmentType: data.attachmentType,
        rawChatterId: data.chatterId,
        userId: user?.id,
        userRole: user?.role,
        payloadSize: JSON.stringify(data).length // Log size instead of content
      });
      
      // Determine chatterId (thread owner)
      let chatterId = user.id;
      
      // If staff is sending, they must provide chatterId (the recipient)
      if (["admin", "supervisor", "dev"].includes(user.role)) {
          if (!data.chatterId) return res.status(400).json({ error: "Staff must specify chatterId" });
          chatterId = data.chatterId;
      } else {
          // If chatter is sending, they are the thread owner
          chatterId = user.id;
      }

      // Validate payload
      const parsedMsg = insertSupportMessageSchema.safeParse({
          senderId: user.id,
          chatterId: chatterId,
          content: data.content,
          attachmentUrl: data.attachmentUrl,
          attachmentType: data.attachmentType
      });
      
      if (!parsedMsg.success) {
          console.error("[API] Validation error:", parsedMsg.error);
          return res.status(400).json({ error: parsedMsg.error.message });
      }

      // Create message
      const msg = await storage.createSupportMessage(parsedMsg.data);

      // Add sender name for UI display
      const msgWithSender = { ...msg, senderName: user.name };

      // Emit to chatter (thread owner)
      io.to(`user_${chatterId}`).emit("new_support_message", msgWithSender);
      
      // Emit to staff
      io.to("support_staff").emit("new_support_message", msgWithSender);

      res.json(msgWithSender);
    } catch (e) {
      console.error("[API] Error sending support message:", e);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.get("/api/support/history", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const messages = await storage.getSupportMessages(userId);
    res.json(messages);
  });

  app.get("/api/support/unread-count", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const count = await storage.getUnreadSupportCountForChatter(userId);
      res.json({ count });
    } catch (e) {
      console.error("[API] Error getting support unread count:", e);
      res.status(500).json({ count: 0 });
    }
  });

  app.get("/api/support/threads", requireAuth, requireRole(["dev", "admin", "supervisor"]), async (_req, res) => {
    const threads = await storage.getSupportThreads();
    const enrichedThreads = await Promise.all(threads.map(async (t) => {
      const chatter = await storage.getUser(t.chatterId);
      
      let chatterAvatar: string | null = chatter?.avatar || null;

      if (!chatterAvatar && chatter?.currentModelId) {
        try {
          const model = await storage.getModel(chatter.currentModelId);
          if (model?.avatar) {
            chatterAvatar = model.avatar;
          }
        } catch {
        }
      }

      return { 
        ...t, 
        chatterName: chatter?.name || "Desconhecido",
        chatterAvatar
      };
    }));
    res.json(enrichedThreads);
  });

  app.get("/api/support/history/:chatterId", requireAuth, requireRole(["dev", "admin", "supervisor"]), async (req, res) => {
    const chatterId = parseInt(req.params.chatterId);
    const messages = await storage.getSupportMessages(chatterId);
    res.json(messages);
  });

  app.post("/api/support/read/:chatterId", requireAuth, requireRole(["dev", "admin", "supervisor"]), async (req, res) => {
    const chatterId = parseInt(req.params.chatterId);
    await storage.markSupportMessagesAsRead(chatterId);
    try {
      io.to(`user_${chatterId}`).emit("support_read_by_staff", { chatterId });
    } catch (e) {
      console.error("[Socket] Failed to emit support_read_by_staff:", e);
    }
    res.status(200).json({ message: "Messages marked as read" });
  });

  app.post("/api/support/read-mine", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      await storage.markSupportMessagesAsReadByChatter(userId);
      res.status(200).json({ message: "Messages marked as read for chatter" });
    } catch (e) {
      console.error("[API] Error marking chatter messages as read:", e);
      res.status(500).json({ message: "Failed to mark as read" });
    }
  });

  // --- Device Management ---
  app.get("/api/admin/devices", requireAuth, requireRole(["dev", "admin"]), async (req, res) => {
    const devices = await storage.getDevices();
    // Enrich with username
    const users = await storage.getUsers();
    const userMap = new Map(users.map(u => [u.id, u]));
    
    const enriched = devices.map(d => ({
        ...d,
        username: d.userId ? userMap.get(d.userId)?.username : 'Desconhecido'
    }));
    
    res.json(enriched);
  });

  app.post("/api/admin/devices/:id/block", requireAuth, requireRole(["dev", "admin"]), async (req, res) => {
    const deviceId = req.params.id;
    await storage.updateDevice(deviceId, { status: 'blocked' });
    res.json({ message: "Dispositivo bloqueado" });
  });

  app.post("/api/admin/devices/:id/unblock", requireAuth, requireRole(["dev", "admin"]), async (req, res) => {
    const deviceId = req.params.id;
    await storage.updateDevice(deviceId, { status: 'active' });
    res.json({ message: "Dispositivo desbloqueado" });
  });

  return httpServer;
}
