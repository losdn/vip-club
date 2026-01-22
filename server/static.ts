import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Em ES modules, __dirname não existe, então precisamos criar
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function serveStatic(app: Express) {
  // Tenta encontrar o diretório de build em diferentes locais
  const possiblePaths = [
    path.resolve(__dirname, "public"), // Produção (compilado)
    path.resolve(__dirname, "..", "dist", "public"), // Build do Vite
    path.resolve(process.cwd(), "dist", "public"), // Build do Vite (alternativo)
  ];
  
  let distPath: string | null = null;
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      distPath = possiblePath;
      console.log(`[Static] Found build directory at: ${distPath}`);
      break;
    }
  }
  
  if (!distPath) {
    throw new Error(
      `Could not find the build directory. Tried: ${possiblePaths.join(", ")}\n` +
      `Make sure to build the client first with: npm run build`
    );
  }

  // TERCEIRO: Servir arquivos estáticos do React
  // CRÍTICO: index: false evita que express.static sirva index.html automaticamente
  app.use(express.static(distPath, { index: false }));

  // QUARTO: O Catch-all do React (ÚLTIMA LINHA)
  // Serve index.html apenas para rotas que NÃO são da API
  app.get('*', (req, res) => {
    // CRÍTICO: Se for rota da API, NUNCA serve o index.html
    const isApiRoute = req.originalUrl?.startsWith("/api") || 
                       req.path?.startsWith("/api") ||
                       req.originalUrl?.includes("/api/");
    
    if (isApiRoute) {
      // Se chegou aqui, algo está errado - o middleware de segurança deveria ter bloqueado
      // Mas mesmo assim, retorna 404 JSON
      res.status(404).json({ 
        error: "Rota de API não encontrada no servidor.",
        path: req.originalUrl || req.path
      });
      return;
    }
    
    // Só serve index.html se NÃO for rota da API
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
