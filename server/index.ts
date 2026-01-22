// Carrega variáveis de ambiente do arquivo .env
import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes, resetSystemActivity } from "./routes";
import { serveStatic } from "./static";
import { setupVite } from "./vite";
import { createServer } from "http";
import { storage } from "./storage";
// import geoip from 'geoip-lite';

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Extend Request to include IP and Location
declare module "express-serve-static-core" {
  interface Request {
    cleanIp?: string;
    location?: string;
    deviceId?: string;
  }
}

// Global Error Handlers to prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
  // Keep running if possible, but logging is crucial
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

// 1. MIDDLEWARES DE PARSING
app.use(express.json({
  limit: '100mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: false, limit: '100mb' }));

// Helper de Log
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// 2. MIDDLEWARE DE LOGGING DE API
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        if (path.startsWith("/api/support")) {
          if (Array.isArray(capturedJsonResponse)) {
            logLine += ` :: items=${capturedJsonResponse.length}`;
          } else if (capturedJsonResponse && typeof capturedJsonResponse === "object") {
            const keys = Object.keys(capturedJsonResponse);
            logLine += ` :: keys=${keys.join(",")}`;
          }
        } else {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }
      }
      log(logLine);
    }
  });
  next();
});

// 2.1 MIDDLEWARE DE SEGURANÇA (IP BLOCK & DEVICE BLOCK & LOG)
app.use(async (req, res, next) => {
  try {
    // Priority: X-Forwarded-For (first) -> X-Real-IP -> socket.remoteAddress
    let ip = req.headers['x-forwarded-for'] as string;
    if (ip) {
      // Get the first IP in the list
      ip = ip.split(',')[0].trim();
    } else {
      ip = (req.headers['x-real-ip'] as string) || req.socket.remoteAddress || 'unknown';
    }
    
    // Clean IP (remove ::ffff:)
    let cleanIp = ip.replace('::ffff:', '');
    
    // Normalize localhost
    if (cleanIp === '::1') {
        cleanIp = '127.0.0.1';
    }
    
    req.cleanIp = cleanIp;

    // Check if blocked
    const isBlocked = await storage.isIpBlocked(cleanIp);
    if (isBlocked) {
      log(`[Security] Blocked access attempt from ${cleanIp}`);
      res.status(403).json({ error: "Access Denied. Your IP is blocked." });
      return;
    }

    // --- DEVICE AUTH ---
    const deviceId = req.headers['x-device-id'] as string;
    if (deviceId) {
      req.deviceId = deviceId;
      const device = await storage.getDevice(deviceId);
      
      if (device && device.status === 'blocked') {
        log(`[Security] Blocked access attempt from Device ${deviceId} (IP: ${cleanIp})`);
        res.status(403).json({ error: "Device Blocked", code: "DEVICE_BLOCKED" });
        return;
      }

      // If device exists and is active, we update last active info
      if (device) {
        // We do this asynchronously to not block the request
        storage.updateDevice(deviceId, { 
           lastIp: cleanIp,
           lastActiveAt: new Date()
        }).catch(err => console.error("Error updating device activity:", err));
      }
    }

    // Get Location from IP
    let location = 'Unknown Location';
    try {
      if (cleanIp === '127.0.0.1' || cleanIp === '::1') {
          location = 'Servidor Local';
      } else if (cleanIp !== 'unknown') {
          // Only fetch for non-local IPs to save API calls
          // Maybe cache this? For now, we keep it per request but only for login/admin
          // Actually, we want it for the device update too.
      }
    } catch (e) {
      console.error("GeoIP Error:", e);
    }
    
    // If it's a login/admin request, we definitely want the location
    if (req.path === '/api/login' || req.path === '/api/user' || req.path.startsWith('/api/admin') || deviceId) {
         try {
            if (cleanIp !== '127.0.0.1' && cleanIp !== '::1' && cleanIp !== 'unknown') {
                 const geoRes = await fetch(`http://ip-api.com/json/${cleanIp}`);
                 if (geoRes.ok) {
                     const geo = await geoRes.json();
                     if (geo.status === 'success') {
                         location = `${geo.city}, ${geo.regionName}, ${geo.country}`;
                     }
                 }
            }
         } catch(e) {}
    }
    
    req.location = location;

    // Log connection for API calls (limit to relevant ones to avoid spam)
    // We log: Login attempts, Initial loads, and Admin actions
    if (req.path === '/api/login' || req.path === '/api/user' || req.path.startsWith('/api/admin')) {
      const userAgent = req.headers['user-agent'] || 'unknown';
      
      // Log after response is finished so we have session data (userId)
      res.on('finish', async () => {
        try {
          // Try to get user data from session
          const sessionUserId = (req as any).session?.userId;
          let username = undefined;
          let userId = undefined;

          if (sessionUserId) {
             userId = sessionUserId;
             // We could fetch user here, but to avoid DB spam, we can trust the session or just log ID
             // Ideally we want the username. Let's quick fetch it if we have ID.
             try {
               const user = await storage.getUser(sessionUserId);
               if (user) {
                 username = user.username;
               }
             } catch(e) {}
          }
          
          // Log to DB
          await storage.logConnection({
            ip: cleanIp,
            userId,
            username,
            location: location,
            userAgent,
            blocked: isBlocked, // Should always be false here if we reached this point
            deviceId: deviceId
          });
          
        } catch (e) {
          console.error("Error logging connection:", e);
        }
      });
    }

    next();
  } catch (err) {
    console.error("[Security Middleware] Error:", err);
    next();
  }
});

// 3. INICIALIZAÇÃO ASSÍNCRONA
(async () => {
  log("Iniciando inicialização do servidor...");
  
  try {
    // Correção de schema: cria colunas ausentes quando necessário
    try {
      const { pool } = await import("./db");
      await pool.query(`ALTER TABLE IF EXISTS models ADD COLUMN IF NOT EXISTS cover TEXT;`);
      await pool.query(`ALTER TABLE IF EXISTS models ADD COLUMN IF NOT EXISTS is_validated BOOLEAN DEFAULT FALSE;`);
      await pool.query(`ALTER TABLE IF EXISTS models ADD COLUMN IF NOT EXISTS proxy_url TEXT;`);
      await pool.query(`ALTER TABLE IF EXISTS models ADD COLUMN IF NOT EXISTS chat_group TEXT;`);
      await pool.query(`ALTER TABLE IF EXISTS models ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';`);
      await pool.query(`ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS chat_group TEXT;`);
      await pool.query(`ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP;`);
      await pool.query(`ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS current_model_id INTEGER;`);
      await pool.query(`ALTER TABLE IF EXISTS connection_logs ADD COLUMN IF NOT EXISTS device_id TEXT;`);
      
      // FIX: Atualiza histórico antigo para refletir o chat_group do USUÁRIO, não da modelo
      await pool.query(`
        UPDATE access_logs 
        SET chat_group = CASE 
            WHEN users.chat_group IS NULL OR users.chat_group = '' THEN 'Sem Chat' 
            ELSE users.chat_group 
        END
        FROM users 
        WHERE access_logs.user_id = users.id;
      `);
    } catch (schemaErr) {
      console.error("[Server] Erro ao ajustar schema (safe):", schemaErr);
    }

    // Registra as rotas da API (Chat, Login, Permissões)
    const { resourceManager } = await import("./routes"); // Import resourceManager here
    await registerRoutes(httpServer, app);
    log("[Server] Rotas da API registradas.");

    // Middleware de segurança para 404 da API (Deve vir após registerRoutes)
    app.use('/api', (req, res) => {
      if (!res.headersSent) {
        res.status(404).json({ error: "Rota de API não encontrada", path: req.path });
      }
    });

    // Configuração do Frontend (Vite em Dev, Estáticos em Prod)
    if (process.env.NODE_ENV !== "production") {
      await setupVite(httpServer, app);
      log("[Server] Vite middleware configurado para desenvolvimento.");
    } else {
      try {
        serveStatic(app);
        log("[Server] Servidor de arquivos estáticos configurado.");
      } catch (staticError) {
        console.error("[Server] Erro ao carregar estáticos: Execute 'npm run build'.");
      }
    }

    // Reset automático do histórico todo dia 01
    let lastResetKey: string | null = null;
    const checkMonthlyReset = async () => {
      try {
        const now = new Date();
        const key = `${now.getFullYear()}-${now.getMonth() + 1}`;
        if (now.getDate() === 1 && lastResetKey !== key) {
          const { storage } = await import("./storage");
          log("[Server] Resetando histórico de acesso (dia 01 detectado)");
          await storage.resetAccessLogsForMonth();
          resetSystemActivity(); // Reset Activity Recent (mantendo "Sistema iniciado...")
          lastResetKey = key;
        }
      } catch (e) {
        console.error("[Server] Erro ao resetar histórico mensal:", e);
      }
    };
    await checkMonthlyReset();
    setInterval(checkMonthlyReset, 30 * 60 * 1000);

    // Seed: cria usuário Dev se não existir
    try {
      const { storage } = await import("./storage");
      const existingDev = await storage.getUserByUsername("dev@vipclub.com");
      if (!existingDev) {
        await storage.createUser({
          name: "Dev",
          username: "dev@vipclub.com",
          password: "dev",
          role: "dev",
          active: true,
          chatGroup: ""
        } as any);
        log("[Seed] Usuário Dev criado (dev@vipclub.com)");
      }
    } catch (seedErr) {
      console.error("[Seed] Falha ao criar usuário Dev:", seedErr);
    }

    // Seed básico: garantir Admin/Chatter e pelo menos 2 modelos ativas
    try {
      const { storage } = await import("./storage");
      const existingAdmin = await storage.getUserByUsername("admin@vipclub.com");
      if (!existingAdmin) {
        await storage.createUser({
          name: "Admin",
          username: "admin@vipclub.com",
          password: "admin",
          role: "admin",
          active: true,
          chatGroup: ""
        } as any);
        log("[Seed] Usuário Admin criado (admin@vipclub.com)");
      }

      const existingChatter = await storage.getUserByUsername("chatter@vipclub.com");
      if (!existingChatter) {
        await storage.createUser({
          name: "Chatter Demo",
          username: "chatter@vipclub.com",
          password: "chatter",
          role: "chatter",
          active: true,
          chatGroup: "Chat 1"
        } as any);
        log("[Seed] Usuário Chatter criado (chatter@vipclub.com)");
      }

      const models = await storage.getModels();
      if (!models || models.length === 0) {
        await storage.createModel({
          name: "Modelo A",
          platformEmail: "modeloA@privacy.com.br",
          platformPassword: "senhaA",
          avatar: "",
          status: "active",
          chatGroup: "Chat 1",
          proxyUrl: "",
          isValidated: false
        } as any);

        await storage.createModel({
          name: "Modelo B",
          platformEmail: "modeloB@privacy.com.br",
          platformPassword: "senhaB",
          avatar: "",
          status: "active",
          chatGroup: "Chat 2",
          proxyUrl: "",
          isValidated: false
        } as any);

        log("[Seed] Modelos iniciais criadas (A/B)");
      }
    } catch (seedErr) {
      console.error("[Seed] Falha no seed básico:", seedErr);
    }

    // Global Error Handler
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });

    setInterval(() => {
      resourceManager.cleanupInactiveSessions();
    }, 5 * 60 * 1000);

    const requestedPort = Number(process.env.PORT) || 3040;
    let server: ReturnType<typeof httpServer.listen> | null = null;
    let currentPort = requestedPort;

    const startServer = (port: number, attempt: number) => {
      currentPort = port;
      server = httpServer.listen(port, "0.0.0.0", () => {
        log(`Rodando com sucesso na porta ${port}`);
      });

      server.on("error", (err: any) => {
        if (err?.code === "EADDRINUSE" && attempt < 3) {
          const nextPort = port + 1;
          log(`Porta ${port} em uso, tentando porta ${nextPort}...`);
          startServer(nextPort, attempt + 1);
        } else {
          console.error("[Server] Erro ao iniciar servidor:", err);
        }
      });
    };

    startServer(requestedPort, 1);

    // Graceful Shutdown
    const shutdown = async () => {
      log("Encerrando servidor...");
      try {
        await resourceManager.killAllSessions();
      } catch (err) {
        console.error("Erro ao limpar sessões:", err);
      }
      
      if (server) {
        server.close(() => {
          log("Servidor encerrado.");
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
      
      // Força encerramento se travar
      setTimeout(() => process.exit(1), 10000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (err) {
    console.error("Erro fatal na inicialização:", err);
    process.exit(1);
  }
})();
