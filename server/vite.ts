import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

// CORREÇÃO: Definindo __dirname manualmente para evitar o erro de "undefined"
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        // Não matar o processo em erros do Vite (CSS, HMR, etc)
        // process.exit(1); 
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // BLOQUEADOR: Impede que o Vite tente processar rotas de API
  const apiBlocker = (req: any, res: any, next: any) => {
    const url = req.originalUrl || req.url || '';
    
    if (req.isApiRoute || url.startsWith("/api")) {
      if (res.headersSent) return;
      
      // Se for uma rota /api que chegou aqui, significa que não foi encontrada no routes.ts
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(404).json({ 
        message: "Rota da API não encontrada", 
        path: url
      });
    }
    next();
  };
  
  app.use(apiBlocker);

  // Middleware para arquivos estáticos do Vite
  app.use(vite.middlewares);

  // Catch-all para servir o index.html do React
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl || req.url || "";
    const reqPath = (req as any).path || url.split('?')[0];

    if (res.headersSent) return;
    
    // Verificação de segurança para não servir HTML em rotas de API
    const isApiRoute = (req as any).isApiRoute || url.startsWith("/api") || reqPath.startsWith("/api");
    
    if (isApiRoute) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(404).json({ message: "API endpoint not found" });
    }

    try {
      // Caminho corrigido usando a variável definida no topo
      const clientTemplate = path.resolve(__dirname, "..", "client", "index.html");

      if (!fs.existsSync(clientTemplate)) {
        return res.status(500).send("index.html não encontrado na pasta client");
      }

      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      
      // Cache busting
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );

      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}