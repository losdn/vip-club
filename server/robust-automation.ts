import { chromium } from 'playwright-core';
import { eq } from "drizzle-orm";
import { db } from "./db";
import { models, users } from "../shared/schema";
import fs from "fs/promises";
import path from "path";
import { spawn, exec } from "child_process";
import { resourceManager } from "./resource-manager";
import util from "util";

const execAsync = util.promisify(exec);

const USER_DATA_DIR = path.join(process.cwd(), ".user_data");

// User Agent padrão para garantir consistência entre Admin e Chatter e reduzir detecção de bot
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function closeChromeByUserDataDir(userDataDir: string) {
  const dirName = path.basename(userDataDir);
  const lockPath = path.join(userDataDir, 'SingletonLock');

  // Otimização: Se não existe SingletonLock, provavelmente não há processo rodando
  try {
    await fs.access(lockPath);
  } catch {
    // Arquivo de lock não existe, assumimos que está limpo para evitar overhead do PowerShell
    // Apenas verificamos se realmente não tem lock, pois o PowerShell é lento (~1-2s)
    // console.log(`[Chrome] SingletonLock ausente em ${dirName}. Assumindo limpo.`);
    return;
  }

  console.log(`[Chrome] Buscando processos travados para: ${dirName}`);
  
  try {
    // Usar PowerShell em vez de WMIC (que está depreciado e falha em alguns ambientes)
    // Busca processos chrome/edge que estejam usando este diretório de usuário
    const psCommand = `Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'chrome.exe' -or $_.Name -eq 'msedge.exe') -and $_.CommandLine -like '*${dirName}*' } | Select-Object -ExpandProperty ProcessId`;
    
    const { stdout } = await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, { timeout: 15000 });
    
    // Parseia os PIDs da saída
    const pids = stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => /^\d+$/.test(line));

    if (pids.length > 0) {
      console.log(`[Chrome] Encontrados ${pids.length} processos para encerrar (PIDs: ${pids.join(', ')})`);
      
      // 2. Matar cada PID forçadamente
      for (const pid of pids) {
        try {
          await execAsync(`taskkill /PID ${pid} /F`);
          console.log(`[Chrome] PID ${pid} encerrado com sucesso.`);
        } catch (e: any) {
           // Ignora erro se o processo já não existir
           if (!e.message?.includes('not found') && !e.message?.includes('não encontrado')) {
             console.log(`[Chrome] Falha ao matar PID ${pid}: ${e.message}`);
           }
        }
      }
      
      // Pequeno delay para o sistema operacional liberar os arquivos e handles
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log(`[Chrome] Nenhum processo travado encontrado para ${dirName}`);
    }

    // 3. Verificar e remover SingletonLock se existir (após matar processos)
    try {
      const lockPath = path.join(userDataDir, 'SingletonLock');
      try {
        await fs.access(lockPath);
        console.log(`[Chrome] SingletonLock encontrado em ${dirName}. Removendo...`);
        await fs.unlink(lockPath);
        console.log(`[Chrome] SingletonLock removido com sucesso.`);
      } catch {
        // Arquivo não existe, tudo bem
      }
    } catch (e: any) {
      console.warn(`[Chrome] Falha ao verificar/remover SingletonLock: ${e.message}`);
    }

  } catch (e: any) {
    console.log(`[Chrome] Erro ao buscar/matar processos: ${e.message}`);
  }
}

let cachedChromePath: string | null = null;

async function resolveChromeExecutable(): Promise<string> {
  if (cachedChromePath) return cachedChromePath;

  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv) {
    cachedChromePath = fromEnv;
    return fromEnv;
  }

  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
      : null,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      await fs.access(p);
      cachedChromePath = p;
      return p;
    } catch {
      // ignore
    }
  }

  // Se nenhum navegador nativo for encontrado, tenta usar o Chromium do Playwright
  try {
     const playwrightChromium = chromium.executablePath();
     if (playwrightChromium) {
       cachedChromePath = playwrightChromium;
       return playwrightChromium;
     }
  } catch (e) {
     console.log("Chromium do Playwright não encontrado.");
  }

  throw new Error("Nenhum executável do Chrome/Edge foi encontrado. Defina CHROME_PATH ou instale um navegador compatível.");
}

async function openNormalChrome(userDataDir: string, url: string, proxyUrl?: string): Promise<any> {
  await fs.mkdir(userDataDir, { recursive: true });
  const chromeExe = await resolveChromeExecutable();

  const args = [
    `--user-data-dir=${userDataDir}`,
    "--profile-directory=Default",
    "--new-window",
    "--no-sandbox",
    "--disable-infobars",
    "--disable-extensions",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-component-update",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-blink-features=AutomationControlled", // STEALTH: Remove detecção de automação
    "--disable-dev-shm-usage", // VITAL PARA VPS: Usa disco em vez de /dev/shm (memória) para evitar crash
    `--user-agent=${DEFAULT_USER_AGENT}`,
    url,
  ];

  if (proxyUrl) {
    console.log(`[Chrome] Iniciando com proxy configurado`);
    args.push(`--proxy-server=${proxyUrl}`);
  }

  return new Promise((resolve, reject) => {
    try {
      const child = spawn(chromeExe, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      });

      let settled = false;

      child.once("error", (err) => {
        if (settled) return;
        settled = true;
        console.error(`[Chrome] Erro ao iniciar processo: ${err.message}`);
        reject(new Error(`Falha ao iniciar navegador: ${err.message}`));
      });

      child.once("spawn", () => {
        if (settled) return;
        settled = true;
        console.log(`[Chrome] Processo iniciado com sucesso (pid=${child.pid})`);
        child.unref();
        resolve(child);
      });

      setTimeout(() => {
        if (settled) return;
        settled = true;
        console.log("[Chrome] Timeout de inicialização atingido, seguindo mesmo assim.");
        try {
          child.unref();
        } catch {}
        resolve(child);
      }, 5000);
    } catch (e: any) {
      console.error("[Chrome] Exceção ao tentar iniciar navegador:", e?.message || e);
      reject(new Error(e?.message || "Falha desconhecida ao iniciar navegador"));
    }
  });
}

// Helper para sincronizar cookies/sessão do perfil Master para outros perfis
async function syncProfileData(modelId: number, targetProfileDir: string) {
  const masterProfileDir = path.join(USER_DATA_DIR, `model_${modelId}_master`);
  
  try {
    // Verifica se o master existe
    await fs.access(masterProfileDir);
    
    // Lista de diretórios/arquivos para sincronizar
    const pathsToSync = [
      { src: ["Default", "Network"], dest: ["Default", "Network"] },
      { src: ["Default", "Local Storage"], dest: ["Default", "Local Storage"] },
      { src: ["Default", "Session Storage"], dest: ["Default", "Session Storage"] },
      { src: ["Default", "IndexedDB"], dest: ["Default", "IndexedDB"] }, // Importante para alguns sites
      { src: ["Default", "Service Worker"], dest: ["Default", "Service Worker"] }, // Importante para PWAs/Auth
      
      // Arquivos individuais importantes
      { src: ["Default", "Cookies"], dest: ["Default", "Cookies"], isFile: true },
      { src: ["Default", "Network", "Cookies"], dest: ["Default", "Network", "Cookies"], isFile: true },
      { src: ["Default", "Preferences"], dest: ["Default", "Preferences"], isFile: true },
      { src: ["Default", "Web Data"], dest: ["Default", "Web Data"], isFile: true },
    ];

    // Se tiver cookies JSON disponíveis, evitamos copiar arquivos que costumam travar (SQLite/LevelDB)
    // Isso evita corrupção de perfil e problemas de EBUSY
    const cookiePath = path.join(USER_DATA_DIR, `cookies_model_${modelId}.json`);
    let skipHeavyFiles = false;
    try {
        await fs.access(cookiePath);
        skipHeavyFiles = true;
        console.log(`[Sync] Cookies JSON encontrados. Ignorando arquivos pesados/travados para evitar corrupção.`);
    } catch {}

    if (skipHeavyFiles) {
        // Remove DBs pesados da lista de sincronização se tivermos injeção JSON
        // Mantemos apenas pastas estruturais e configs leves.
        // NOTA: IndexedDB e Service Worker são cruciais para a sessão persistir em alguns sites (Firebase/PWA),
        // então não os removemos da lista. A função robustCopy lidará com bloqueios se houver.
        const heavyPatterns = ["Cookies", "Web Data", "Local Storage", "Session Storage"];
        for (let i = pathsToSync.length - 1; i >= 0; i--) {
            const itemPath = pathsToSync[i].src.join('/');
            if (heavyPatterns.some(pattern => itemPath.includes(pattern))) {
                pathsToSync.splice(i, 1);
            }
        }
    }

    console.log(`[Sync] Iniciando sincronização completa de ${modelId} para ${targetProfileDir}...`);

    for (const item of pathsToSync) {
      const sourcePath = path.join(masterProfileDir, ...item.src);
      const targetPath = path.join(targetProfileDir, ...item.dest);

      try {
        await fs.access(sourcePath);
        
        if (!item.isFile) {
          await fs.mkdir(targetPath, { recursive: true });
        } else {
           // Garante diretório pai
           await fs.mkdir(path.dirname(targetPath), { recursive: true });
        }

        // Função recursiva para copiar diretórios ignorando arquivos travados
        const robustCopy = async (src: string, dest: string) => {
          const stats = await fs.stat(src);
          if (stats.isDirectory()) {
            await fs.mkdir(dest, { recursive: true });
            const entries = await fs.readdir(src);
            for (const entry of entries) {
              await robustCopy(path.join(src, entry), path.join(dest, entry));
            }
          } else {
            try {
              await fs.copyFile(src, dest);
            } catch (err: any) {
              if (err.code === 'EBUSY' || err.code === 'EPERM') {
                 // Tenta ler e escrever manualmente como último recurso
                 try {
                   const content = await fs.readFile(src);
                   await fs.writeFile(dest, content);
                 } catch (e) {
                   // Se falhar, ignora este arquivo específico (ex: Lock files)
                   // console.log(`[Sync] Ignorando arquivo travado: ${src}`);
                 }
              }
            }
          }
        };

        // Tenta copiar. Se falhar (arquivo travado), tenta estratégia robusta
        try {
            await fs.cp(sourcePath, targetPath, { recursive: true, force: true, preserveTimestamps: true });
            console.log(`[Sync] Copiado: ${item.src.join('/')}`);
        } catch (copyError: any) {
            if (copyError.code === 'EBUSY' || copyError.code === 'EPERM') {
                console.warn(`[Sync] Bloqueio detectado em ${item.src.join('/')}. Usando cópia robusta item-a-item...`);
                if (item.isFile) {
                   try {
                     const content = await fs.readFile(sourcePath);
                     await fs.writeFile(targetPath, content);
                   } catch (e) {}
                } else {
                   await robustCopy(sourcePath, targetPath);
                }
                console.log(`[Sync] Recuperado via cópia robusta: ${item.src.join('/')}`);
            } else {
                throw copyError;
            }
        }
      } catch (e: any) {
        // Ignora erros de arquivo não encontrado, mas loga se for outro erro
        if (e.code !== 'ENOENT') {
             console.log(`[Sync] Falha ao copiar ${item.src.join('/')}: ${e.message}`);
        }
      }
    }
    console.log(`[Sync] Sincronização finalizada.`);

  } catch (e) {
    console.log(`[Sync] Perfil Master não existe ainda. Pule sincronização.`);
  }
}

export async function openSupervisorBrowser(modelId: number, userId: number) {
  // DEPRECATED: Use openMonitorBrowser instead
  return openMonitorBrowser(modelId, userId);
}

export async function openMonitorBrowser(modelId: number, userId: number) {
  const model = await db.query.models.findFirst({
    where: eq(models.id, modelId),
  });

  const sessionKey = `monitor_${modelId}_${userId}`;
 
   // Monitor: isAdmin=false para não bloquear Validação, mas usa perfil Master
   return await resourceManager.queueSession(modelId, userId, false, async () => {
     try {
       const userDataDir = path.join(USER_DATA_DIR, `model_${modelId}_master`);
       
       // Verifica se já existe sessão admin ativa (ex: validação) para não derrubar
       const hasAdmin = resourceManager.hasActiveAdminSession(modelId);
       
       if (!hasAdmin) {
         // Garante que processos anteriores sejam fechados para liberar o lock do perfil
         await closeChromeByUserDataDir(userDataDir);
       } else {
         console.log(`[Monitor] Sessão admin ativa detectada. Ignorando limpeza forçada.`);
       }
       
       const url = "https://privacy.com.br/Chat";
       const child = await openNormalChrome(userDataDir, url, model?.proxyUrl || undefined);
 
       // Listener para remover a sessão quando o navegador fechar
       child.on('exit', () => {
         console.log(`[Monitor] Processo encerrado (PID ${child.pid}). Removendo sessão ${sessionKey}.`);
         resourceManager.removeSession(sessionKey);
       });

       resourceManager.addSession(sessionKey, {
         modelId,
         userId,
         isAdmin: false, // Não bloqueia Validação
         process: child,
         startTime: new Date(),
         lastActivity: new Date(),
         modelName: model?.name,
         userName: "Monitor"
       });
 
       return {
         status: "success",
         message: "Navegador de monitoramento aberto.",
         strategy: 0,
         sessionId: sessionKey,
       };
     } catch (error: any) {
       console.error("[Monitor] Erro ao abrir navegador de monitoramento:", error);
       return {
         status: "failed",
         message: error?.message || "Erro ao abrir monitoramento.",
       };
     }
   });
 }

// Abre o navegador Master apenas para Login (Admin)
export async function openValidationBrowser(modelId: number, userId: number = 0) {
  const model = await db.query.models.findFirst({
    where: eq(models.id, modelId),
  });

  if (!model) {
    return {
      status: "failed",
      message: "Modelo não encontrada para validação.",
    };
  }

  const sessionKey = `${modelId}_master_validation`;

  try {
    // Fecha processos antes de tentar abrir para evitar conflitos
    const userDataDir = path.join(USER_DATA_DIR, `model_${modelId}_master`);
    await closeChromeByUserDataDir(userDataDir);
  } catch (error) {
    console.warn(`[Validation] Falha ao preparar navegador para modelo ${modelId}:`, error);
  }

  const userDataDir = path.join(USER_DATA_DIR, `model_${modelId}_master`);
  const url = "https://privacy.com.br/Chat";

  // Usar queueSession para garantir limite de 1 admin por modelo e rastreamento
  return await resourceManager.queueSession(modelId, userId, true, async () => {
    try {
      const child = await openNormalChrome(userDataDir, url);

      // Listener para remover a sessão quando o navegador fechar
      child.on('exit', () => {
        console.log(`[Validation] Processo do navegador encerrado (PID ${child.pid}). Removendo sessão ${sessionKey}.`);
        resourceManager.removeSession(sessionKey);
      });

      resourceManager.addSession(sessionKey, {
        modelId,
        userId,
        isAdmin: true,
        process: child,
        startTime: new Date(),
        lastActivity: new Date()
      });

      return {
        status: "success",
        message: "Navegador de validação aberto. Faça login manualmente.",
        strategy: 0,
        sessionId: sessionKey,
      };
    } catch (error: any) {
      console.error("[Validation] Erro ao abrir navegador de validação:", error);
      return {
        status: "failed",
        message: error?.message || "Erro ao abrir navegador para validação.",
      };
    }
  });
}

// Estratégias de fallback para diferentes cenários
async function createRobustBrowserContext(userDataDir: string, isAdmin: boolean, modelId: number, proxyUrl?: string, userAgent?: string) {
  console.log(`[Robust] Tentando criar contexto para modelo ${modelId} (isAdmin: ${isAdmin})`);
  
  const strategies = [
    async () => {
      console.log('[Robust] Tentando Chromium padrão...');
      const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-zygote',
        '--disable-blink-features=AutomationControlled', // STEALTH
        ...(isAdmin
          ? [
              '--window-size=1920,1080',
              '--disable-web-security',
              '--allow-running-insecure-content',
            ]
          : ['--window-position=-2000,-2000']),
      ];

      const options: any = {
        channel: 'chrome',
        headless: !isAdmin,
        args,
        ignoreDefaultArgs: ["--enable-automation"], // STEALTH: Remove flag de automação
        timeout: 5000,
        viewport: { width: 1280, height: 800 },
        userAgent: userAgent || DEFAULT_USER_AGENT
      };

      if (userAgent) {
         console.log(`[Robust] Usando User-Agent customizado: ${userAgent.substring(0, 50)}...`);
      } else {
         console.log(`[Robust] Usando User-Agent padrão: ${DEFAULT_USER_AGENT.substring(0, 50)}...`);
      }

      if (proxyUrl) {
        console.log(`[Robust] Usando proxy na estratégia Chromium`);
        options.proxy = { server: proxyUrl };
      }

      // Preferir Chrome instalado para reduzir bloqueios de login e cair para Chromium padrão.
      try {
        return await chromium.launchPersistentContext(userDataDir, options);
      } catch (e) {
        console.log('[Robust] Chrome (channel) indisponível ou lento. Usando Chromium padrão...');
        delete options.channel;
        options.timeout = 30000;
        
        return await chromium.launchPersistentContext(userDataDir, options);
      }
    }
  ];
  
  // Tenta cada estratégia em sequência
  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`[Robust] Tentativa ${i + 1}/${strategies.length}`);
      const context = await strategies[i]();
      console.log(`[Robust] ✅ Contexto criado com sucesso usando estratégia ${i + 1}`);
      return { context, strategy: i + 1 };
    } catch (error: any) {
      console.log(`[Robust] ❌ Estratégia ${i + 1} falhou:`, error.message);
      
      // Mensagens de erro mais amigáveis para o usuário
      let userMessage = "";
      if (error.message?.includes("net::ERR_CONNECTION_FAILED")) {
        userMessage = "Erro de conexão. Verifique sua internet.";
      } else if (error.message?.includes("net::ERR_NAME_NOT_RESOLVED")) {
        userMessage = "Site não encontrado. Tente novamente.";
      } else if (error.message?.includes("Timeout")) {
        userMessage = "Tempo limite excedido. Tente novamente.";
      } else if (error.message?.includes("Failed to launch")) {
        userMessage = "Erro ao abrir navegador. Sistema tentará outra opção.";
      } else {
        userMessage = "Erro temporário. Por favor, tente novamente.";
      }
      
      if (i === strategies.length - 1) {
        throw new Error(userMessage);
      }
    }
  }
}

export async function clearSessionData(modelId: number) {
  try {
    const masterProfileDir = path.join(USER_DATA_DIR, `model_${modelId}_master`);
    const workerProfilePattern = `model_${modelId}_worker`;

    console.log(`[Clear] Iniciando limpeza de dados para modelo ${modelId}...`);

    try {
      await resourceManager.forceCloseSessionsForModel(modelId);
      // Wait a bit for processes to release locks
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.warn(`[Clear] Erro ao fechar sessões ativas para modelo ${modelId}:`, e);
    }

    // 1. Tenta remover o diretório master com retentativas
    let retries = 5;
    let success = false;
    
    while (retries > 0) {
      try {
        // Tenta garantir que não há processos travados antes de tentar remover
        if (retries < 5) {
             await closeChromeByUserDataDir(masterProfileDir);
        }
        
        await fs.rm(masterProfileDir, { recursive: true, force: true });
        console.log(`[Clear] Diretório master removido: ${masterProfileDir}`);
        success = true;
        break;
      } catch (e: any) {
        if (e.code === 'EBUSY' || e.code === 'EPERM') {
          console.warn(`[Clear] Arquivo travado (${e.code}). Tentando novamente em 2s... (${retries} restantes)`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          retries--;
        } else {
          console.warn(`[Clear] Erro ao remover master (pode não existir): ${e.message}`);
          break;
        }
      }
    }
    
    if (!success && retries === 0) {
         console.error(`[Clear] FALHA CRÍTICA: Não foi possível remover o diretório ${masterProfileDir} após várias tentativas.`);
         // Tenta renomear como último recurso para não bloquear o novo login
         try {
             const trashPath = `${masterProfileDir}_trash_${Date.now()}`;
             await fs.rename(masterProfileDir, trashPath);
             console.log(`[Clear] Diretório movido para lixeira: ${trashPath}`);
             // Tenta apagar a lixeira em background sem await
             fs.rm(trashPath, { recursive: true, force: true }).catch(() => {});
         } catch (renameErr) {
             console.error(`[Clear] Falha também ao mover para lixeira:`, renameErr);
         }
    }

    // 2. Remove diretórios de worker (se houver múltiplos ou antigos)
    try {
      const files = await fs.readdir(USER_DATA_DIR);
      for (const file of files) {
        if (file.includes(workerProfilePattern)) {
          const workerDir = path.join(USER_DATA_DIR, file);
          await fs.rm(workerDir, { recursive: true, force: true });
          console.log(`[Clear] Diretório worker removido: ${workerDir}`);
        }
      }
    } catch (e) {
      console.warn(`[Clear] Erro ao limpar workers: ${e}`);
    }

    return true;
  } catch (error) {
    console.error(`[Clear] Erro fatal ao limpar sessão:`, error);
    return false;
  }
}

export async function robustStartSession(modelId: number, userId: number, isAdmin: boolean = false) {
  console.log(`[Robust] Iniciando sessão robusta - ModelId: ${modelId}, UserId: ${userId}, isAdmin: ${isAdmin}`);
  
  // Se for Admin, redireciona para o fluxo de Validação (Master Profile)
  if (isAdmin) {
    return openValidationBrowser(modelId, userId);
  }

  // Chave única para esta sessão
  const sessionKey = `${modelId}_${userId}_chatter`;

  // OTIMIZAÇÃO: Tenta reutilizar sessão existente se estiver saudável
  const existingContext = resourceManager.getSessionContext(modelId, userId);
  if (existingContext) {
    try {
      if (existingContext.pages().length > 0) {
        console.log(`[Robust] Sessão existente encontrada e saudável para ${sessionKey}. Reutilizando.`);
        resourceManager.updateActivity(sessionKey);
        return {
          status: "success",
          message: "Sessão recuperada",
          strategy: 0,
          sessionId: sessionKey
        };
      }
    } catch (e) {
      console.log(`[Robust] Sessão existente inválida ou fechada. Criando nova.`);
    }
  }

  try {
    // Verifica credenciais do modelo
    const model = await db.query.models.findFirst({
      where: eq(models.id, modelId),
    });

    if (!model?.platformEmail || !model?.platformPassword) {
      return { status: "failed", message: "Credenciais da modelo não encontradas." };
    }

    // Busca detalhes do usuário para estatísticas
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    // CHATTER: usa perfil worker separado e sincroniza dados do Master
    // Isso evita conflitos de arquivo (EBUSY) com o Admin e garante cookies atualizados
    return await resourceManager.queueSession(modelId, userId, false, async () => {
      try {
        const workerDir = path.join(USER_DATA_DIR, `model_${modelId}_worker_${userId}`);
        console.log(`[Robust] Preparando sessão worker em: ${workerDir}`);

        // Verificando estratégia de sincronização
        const cookiePath = path.join(USER_DATA_DIR, `cookies_model_${modelId}.json`);
        let useInjectionSync = false;
        try {
            await fs.access(cookiePath);
            useInjectionSync = true;
            console.log(`[Robust] Arquivo de cookies encontrado. Usando estratégia de INJEÇÃO (Light Sync).`);
        } catch {
            console.log(`[Robust] Arquivo de cookies não encontrado. Usando estratégia de CÓPIA (Heavy Sync).`);
        }

        // LIMPEZA PREVENTIVA: Se vamos usar injeção, limpamos o workerDir antigo para evitar 
        // misturar perfil corrompido com injeção limpa.
        if (useInjectionSync) {
            try {
                await fs.rm(workerDir, { recursive: true, force: true });
                await fs.mkdir(workerDir, { recursive: true });
                console.log(`[Robust] Worker dir limpo para garantir injeção limpa.`);
            } catch (e) {
                console.warn(`[Robust] Falha ao limpar worker dir:`, e);
            }
        }

        // HYBRID SYNC STRATEGY:
        // 1. Tenta copiar o perfil completo (Filesystem) para garantir IndexedDB/ServiceWorkers
        // 2. Injeta Cookies/LS do JSON (Memory) para garantir sessão atualizada e contornar locks
        
        const masterProfileDir = path.join(USER_DATA_DIR, `model_${modelId}_master`);
        
        // Decisão de "Matar" o Master:
        // Só matamos se REALMENTE necessário (sem cookies JSON e sem admin online)
        // Se tiver cookies JSON, confiamos neles para o auth e usamos a cópia de arquivos apenas para estrutura
        const shouldKillMaster = !useInjectionSync && !resourceManager.hasActiveAdminSession(modelId);

        if (shouldKillMaster) {
            try {
               console.log(`[Robust] Sem cookies JSON e sem admin ativo. Liberando locks do Master...`);
               await closeChromeByUserDataDir(masterProfileDir);
            } catch (e) {
               console.warn(`[Robust] Aviso ao tentar fechar master:`, e);
            }
        } else {
            console.log(`[Robust] Preservando processo Master (Admin ativo ou Cookies disponíveis).`);
        }

        // Sincroniza dados do perfil Master para o Worker (Best-effort copy)
        await syncProfileData(modelId, workerDir);
        
        // Garante que o diretório existe
        const userDataDir = workerDir;
        try { await fs.mkdir(userDataDir, { recursive: true }); } catch {}

        // --- LEITURA DE USER AGENT (NOVO) ---
        let userAgent: string | undefined;
        try {
          const uaPath = path.join(USER_DATA_DIR, `useragent_model_${modelId}.json`);
          const uaDataRaw = await fs.readFile(uaPath, 'utf-8');
          const uaData = JSON.parse(uaDataRaw);
          if (uaData && uaData.userAgent) {
             userAgent = uaData.userAgent;
             console.log(`[Robust] User-Agent carregado do arquivo.`);
          }
        } catch (e) {
           // Ignore se não existir
        }

        // Cria contexto com estratégias de fallback
        const result = await createRobustBrowserContext(userDataDir, false, modelId, model.proxyUrl || undefined, userAgent);
        if (!result) {
          throw new Error("Falha ao criar contexto");
        }
        const { context, strategy } = result;

        // --- STEALTH INJECTION (Anti-Bot) ---
        await context.addInitScript(() => {
            // Remove a propriedade navigator.webdriver
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            
            // Mascara permissões de notificação (opcional)
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission } as any) :
                    originalQuery(parameters)
            );
        });

        // --- INJEÇÃO DE LOCALSTORAGE (NOVO) ---
        try {
          const lsPath = path.join(USER_DATA_DIR, `localstorage_model_${modelId}.json`);
          const lsDataRaw = await fs.readFile(lsPath, 'utf-8');
          const lsData = JSON.parse(lsDataRaw);
          
          if (lsData && Object.keys(lsData).length > 0) {
            console.log(`[Robust] Injetando LocalStorage sincronizado (${Object.keys(lsData).length} chaves)...`);
            
            await context.addInitScript((data) => {
              try {
                // Injeta incondicionalmente para garantir que esteja lá antes do script da página rodar
                for (const [key, value] of Object.entries(data)) {
                  window.localStorage.setItem(key, value as string);
                }
                // console.log('LocalStorage injetado via InitScript');
              } catch (e) {
                // ignore
              }
            }, lsData);
          }
        } catch (e) {
          // Ignora se não existir
        }

        // --- INJEÇÃO DE COOKIES (NOVO) ---
        // Se houver um arquivo JSON de cookies sincronizado do Electron, injeta-os aqui.
        try {
          const cookiePath = path.join(USER_DATA_DIR, `cookies_model_${modelId}.json`);
          const cookiesData = await fs.readFile(cookiePath, 'utf-8');
          const cookies = JSON.parse(cookiesData);
          if (Array.isArray(cookies) && cookies.length > 0) {
            console.log(`[Robust] Injetando ${cookies.length} cookies sincronizados...`);
            
            // Sanitiza cookies para o formato do Playwright
            const sanitizedCookies = cookies.map((c: any) => {
              const { expirationDate, hostOnly, session, ...rest } = c;
              return {
                ...rest,
                expires: expirationDate, // Mapeia expirationDate (Electron) -> expires (Playwright)
                sameSite: c.sameSite === 'no_restriction' ? 'None' : c.sameSite, // Ajusta sameSite se necessário
                secure: c.sameSite === 'no_restriction' ? true : c.secure, // Garante secure para SameSite=None
              };
            });

            await context.addCookies(sanitizedCookies);
          }
        } catch (e: any) {
          // Se não existir arquivo de cookies, tudo bem, segue com o perfil sincronizado
          // console.log(`[Robust] Sem cookies JSON para injetar: ${e.message}`);
        }
        // ---------------------------------

        console.log(`[Robust] Navegador aberto com estratégia ${strategy}!`);

        // Registra sessão no gerenciador
        resourceManager.addSession(sessionKey, {
          modelId,
          userId,
          userName: user?.name || "Desconhecido",
          modelName: model.name,
          chatGroup: model.chatGroup || undefined,
          context,
          isAdmin: false,
        });

        // Remove sessão quando o navegador for fechado
        context.on('close', () => {
          console.log(`[Robust] Contexto fechado para ${sessionKey}`);
          resourceManager.removeSession(sessionKey);
        });

        // Configura página
        const page = context.pages()[0] || await context.newPage();

        console.log(`[Robust] Navegando para privacy.com.br/Chat...`);
        // Usa a mesma URL do Monitor (admin) para consistência
        await page.goto('https://privacy.com.br/Chat', {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });

        await page.waitForTimeout(2000);

        // Verifica estado de login
        const currentUrl = page.url();
        console.log(`[Robust] URL após navegação: ${currentUrl}`);

        const needsLogin = currentUrl.includes('sign-in') ||
          currentUrl.includes('auth') ||
          currentUrl.includes('login');

        if (needsLogin) {
          console.log(`[Robust] Detectado redirecionamento para login na URL: ${currentUrl}. Tentando recuperação...`);

          // Tenta injetar novamente via evaluate (garantido no contexto da página atual)
          try {
            const lsPath = path.join(USER_DATA_DIR, `localstorage_model_${modelId}.json`);
            const lsDataRaw = await fs.readFile(lsPath, 'utf-8');
            const lsData = JSON.parse(lsDataRaw);
            
            if (lsData && Object.keys(lsData).length > 0) {
               await page.evaluate((data) => {
                   for (const [key, value] of Object.entries(data)) {
                       localStorage.setItem(key, value as string);
                   }
               }, lsData);
               console.log(`[Robust] LocalStorage reinjetado via evaluate.`);
            }
          } catch (e) {
             // Ignora erro se arquivo não existir
          }

          // Recarrega a página para aplicar o LS
          console.log(`[Robust] Recarregando página para aplicar sessão...`);
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(3000);

          const currentUrl2 = page.url();
          const stillNeedsLogin = currentUrl2.includes('sign-in') || 
                                  currentUrl2.includes('auth') || 
                                  currentUrl2.includes('login');

          if (stillNeedsLogin) {
            console.log(`[Robust] Falha na recuperação. URL final: ${currentUrl2}`);
            await context.close();
            resourceManager.removeSession(sessionKey);

            try {
              console.log(`[Robust] Sessão expirada para modelo ${modelId}. (Aviso apenas, não invalidando automaticamente)`);
            } catch (e) {
              console.warn(`[Robust] Erro no log de sessão expirada:`, e);
            }

            return {
              status: "failed",
              message: "Sessão expirada. Peça ao administrador para fazer login novamente.",
            };
          } else {
             console.log(`[Robust] Sessão recuperada com sucesso! URL: ${currentUrl2}`);
          }
        }

        console.log(`[Robust] ✅ Modelo já logada!`);

        return {
          status: "success",
          message: "Conectado à conta da modelo com sucesso!",
          strategy,
          sessionId: sessionKey,
        };
      } catch (error: any) {
        console.error(`[Robust] Erro fatal:`, error);
        resourceManager.removeSession(sessionKey);
        return {
          status: "failed",
          message: `Erro: ${error.message}`,
          strategy: 0,
        };
      }
    });
  } catch (error: any) {
    console.error(`[Robust] Erro fatal:`, error);
    return {
      status: "failed",
      message: `Erro: ${error.message}`,
      strategy: 0,
    };
  }
}

export async function getChatContent(modelId: number, userId: number): Promise<string | null> {
  const context = resourceManager.getSessionContext(modelId, userId);
  if (!context) return null;
  
  const page = context.pages()[0];
  if (!page) return null;

  try {
    // Tenta encontrar o container do chat
    await page.waitForSelector('main, section, [class*="Chat"]', { timeout: 5000 }).catch(() => {});

    // CHECK DE SEGURANÇA: Se estiver na página de login, retorna erro amigável em vez do HTML da página
    const currentUrl = page.url();
    if (currentUrl.includes('sign-in') || currentUrl.includes('auth') || currentUrl.includes('login')) {
      return `
        <style>
          body { background-color: #060610; color: white; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .error-container { text-align: center; padding: 20px; }
          h3 { color: #ff4d4d; }
        </style>
        <div class="error-container">
          <h3>Sessão Expirada</h3>
          <p>O login da modelo precisa ser renovado pelo Administrador.</p>
        </div>
      `;
    }

    const chatHtml = await page.evaluate(() => {
      // INJETAR CSS para esconder header/footer/bordas indesejadas de forma agressiva
      const style = document.createElement('style');
      style.textContent = `
        body, html { background-color: #060610 !important; overflow: hidden !important; height: 100vh !important; width: 100vw !important; }
        header, nav, footer, aside, .header, .navbar, .sidebar, .menu, [class*="Header"], [class*="Sidebar"], [class*="Footer"] { display: none !important; }
        * { border: none !important; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        ::-webkit-scrollbar-track { background: #060610; }
        
        /* Força o container do chat a ocupar a tela toda */
        main, section, [class*="chat-container"], [class*="Chat"] {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            margin: 0 !important;
            padding: 0 !important;
            z-index: 9999 !important;
            background-color: #060610 !important;
        }
      `;
      document.head.appendChild(style);

      // Tenta pegar o container principal do chat
      const container = document.querySelector('main') || 
                        document.querySelector('section[class*="chat"]') ||
                        document.querySelector('[class*="chat-container"]');
      
      if (!container) return document.body.innerHTML;
      
      // Remove scripts e iframes para segurança
      const clone = container.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script, iframe').forEach(el => el.remove());
      
      // Wrapper para garantir estilos e isolamento
      return `
        <style>
          body { 
            background-color: #060610; 
            color: white; 
            font-family: sans-serif; 
            margin: 0; 
            padding: 0;
            overflow: hidden;
            height: 100vh;
            width: 100vw;
          }
          * { box-sizing: border-box; }
        </style>
        ${clone.innerHTML}
      `;
    });

    return chatHtml;
  } catch (error) {
    console.error(`[Robust] Erro ao obter conteúdo do chat:`, error);
    return null;
  }
}
