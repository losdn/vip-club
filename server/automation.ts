import { chromium, type BrowserContext } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USER_DATA_DIR = path.join(__dirname, "..", ".user_data");

async function resolveChromeExecutable(): Promise<string> {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv) return fromEnv;

  // Cache simples para evitar verificação de disco repetida
  if ((global as any).CHROME_EXECUTABLE_PATH) {
    return (global as any).CHROME_EXECUTABLE_PATH;
  }

  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
      : null,
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      await fs.access(p);
      (global as any).CHROME_EXECUTABLE_PATH = p;
      return p;
    } catch {
      // ignore
    }
  }

  return "chrome";
}

async function openNormalChrome(userDataDir: string, url: string) {
  await fs.mkdir(userDataDir, { recursive: true });
  const chromeExe = await resolveChromeExecutable();

  const args = [
    `--user-data-dir=${userDataDir}`,
    "--profile-directory=Default",
    "--new-window",
    url,
  ];

  const child = spawn(chromeExe, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
}

// Separação de contextos:
// - contextInstances: Apenas CHATTERS (sessões de produção permanentes)
// - adminContexts: Apenas ADMIN (sessões temporárias de validação)
const contextInstances = new Map<number, BrowserContext>();
const adminContexts = new Map<number, BrowserContext>();

export async function startAutomationSession(
  modelId: number, 
  modelCredentials: { email: string, password: string },
  isAdmin: boolean = false
) {
  console.log(`[Automation] Iniciando sessão - ModelId: ${modelId}, isAdmin: ${isAdmin}`);
  
  // 1. Se CHATTER e já tem chatter ativo: reutiliza
  if (!isAdmin && contextInstances.has(modelId)) {
    console.log(`[Chatter] Modelo ${modelId} já está ativa. Conectando chatter à sessão existente.`);
    return { status: "success", message: "Conectado à sessão ativa." };
  }
  
  // 2. Se CHATTER mas ADMIN está validando: aguarda e depois reutiliza
  if (!isAdmin && adminContexts.has(modelId)) {
    console.log(`[Chatter] Admin está validando modelo ${modelId}. Aguardando...`);
    // Aguarda 2 segundos e tenta novamente
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (contextInstances.has(modelId)) {
      return { status: "success", message: "Conectado à sessão ativa." };
    }
    // Se admin terminou, abre nova sessão chatter
  }

  // 3. Se ADMIN e já tem admin ativo: fecha o antigo
  if (isAdmin && adminContexts.has(modelId)) {
    console.log(`[Admin] Fechando sessão admin anterior...`);
    const oldAdminContext = adminContexts.get(modelId);
    if (oldAdminContext) {
      try {
        await oldAdminContext.close();
        adminContexts.delete(modelId);
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.log(`[Admin] Erro ao fechar contexto admin anterior:`, e);
        adminContexts.delete(modelId);
      }
    }
  }
  
  // 4. Admin usa diretório separado para não conflitar com chatter
  // CHATTER: model_2 (produção)
  // ADMIN: model_2_admin_view (visualização, copia cookies)
  const baseUserDataDir = path.join(USER_DATA_DIR, `model_${modelId}`);
  const userDataDir = baseUserDataDir;
    
  console.log(`[Automation] UserDataDir: ${userDataDir}`);
  
  try {
    await fs.mkdir(userDataDir, { recursive: true });

    if (isAdmin) {
      await openNormalChrome(userDataDir, "https://privacy.com.br/chat");
      return {
        status: "success",
        message: "Chrome aberto. Faça login manualmente para salvar a sessão.",
      };
    }

    console.log(`[Automation] Abrindo navegador - headless: ${!isAdmin}, isAdmin: ${isAdmin}`);
    console.log(`[Automation] UserDataDir: ${userDataDir}`);
    
    try {
      // CONFIGURAÇÃO DO NAVEGADOR:
      // - ADMIN: headless = false (navegador VISÍVEL para fazer login)
      // - CHATTER: headless = true (navegador INVISÍVEL, usa sessão salva)
      const args = [
        '--disable-blink-features=AutomationControlled',
        '--exclude-switches=enable-automation',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--remote-debugging-port=0',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling',
        ...(isAdmin
          ? [
              '--start-maximized',
              '--top-controls-hide-threshold=0',
              '--force-device-scale-factor=1',
              '--disable-extensions',
              '--disable-plugins',
            ]
          : ['--start-minimized']),
      ];

      // Preferir Chrome instalado (menos chance de bloqueio por automação) e cair para Chromium do Playwright.
      let context: BrowserContext;
      try {
        context = await chromium.launchPersistentContext(userDataDir, {
          channel: 'chrome',
          headless: !isAdmin,
          ignoreDefaultArgs: ['--enable-automation'],
          args,
        });
      } catch (e) {
        console.log(`[Automation] Falha ao abrir com channel=chrome. Usando Chromium padrão.`);
        context = await chromium.launchPersistentContext(userDataDir, {
          headless: !isAdmin,
          ignoreDefaultArgs: ['--enable-automation'],
          args,
        });
      }

      console.log(`[Automation] Navegador aberto com sucesso!`);
    
      // Salva no Map correto
      if (isAdmin) {
        adminContexts.set(modelId, context);
      } else {
        contextInstances.set(modelId, context);
      }
      
      const page = context.pages()[0] || await context.newPage();

      // Se for admin, força o foco e maximiza
      if (isAdmin) {
        try {
          await page.bringToFront();
          console.log(`[Admin] Navegador trazido para frente com sucesso.`);
        } catch (e) {
          console.log(`[Admin] Não foi possível trazer navegador para frente:`, e);
        }
      }

      // Se for admin, adiciona listener (sem interferir no chatter)
      if (isAdmin) {
        context.on('close', () => {
          console.log(`[Admin] Navegador de visualização da modelo ${modelId} foi fechado.`);
          adminContexts.delete(modelId);
          // NÃO reabre chatter - ele já está rodando em paralelo
        });
        console.log(`[Admin] Modo visualização ativo para modelo ${modelId}. Chatter continua em background.`);
      }

      await page.addInitScript(() => { 
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); 
      });

      await page.goto('https://privacy.com.br/chat', { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });

      await page.waitForTimeout(2000); // Reduzido de 5000 para 2000ms

      // 2. VERIFICAÇÃO DE LOGIN:
      const currentUrl = page.url();
      const needsLogin = currentUrl.includes('sign-in') || currentUrl.includes('auth') || currentUrl.includes('login');
      
      if (needsLogin) {
        if (isAdmin) {
          // ADMIN: Login manual para reduzir detecção por automação (captcha, 2FA, etc.)
          console.log(`[Admin] ✅ Navegador ABERTO e VISÍVEL para login da modelo ${modelId}`);
          console.log(`[Admin] 👉 Complete o login manualmente. A sessão será salva em: ${userDataDir}`);
          
          // NÃO fecha o navegador - deixa aberto para o admin
          return { 
            status: "success", 
            message: "Navegador aberto. Complete o login manualmente." 
          };
        } else {
          // CHATTER: Sessão expirada, precisa que o admin faça login novamente
          contextInstances.delete(modelId);
          await context.close();
          return { 
            status: "failed", 
            message: "Sessão expirada. Contate o Administrador para relogar." 
          };
        }
      } else {
        // JÁ ESTÁ LOGADO
        console.log(`[✅] Modelo ${modelId} já está logada. Sessão persistente ativa!`);
        
        // Se for ADMIN, SEMPRE mostra o navegador (mesmo já logado)
        if (isAdmin) {
          console.log(`[Admin] Navegador aberto para visualização. Sessão já validada!`);
          // Garante que o navegador está visível e em primeiro plano
          try {
            await page.bringToFront();
            // Maximiza a janela se possível
            await page.setViewportSize({ width: 1920, height: 1080 });
            console.log(`[Admin] Navegador trazido para frente e maximizado.`);
          } catch (e) {
            console.log(`[Admin] Não foi possível trazer navegador para frente:`, e);
          }
          // Navegador já está aberto (headless: false), então só retorna sucesso
          return { 
            status: "success", 
            message: "Sessão já validada! Navegador aberto para visualização." 
          };
        }
        
        // Se for chatter, mantém invisível e retorna sucesso
        return { 
          status: "success", 
          message: "Conectado com sucesso!" 
        };
      }
    } catch (error) {
      console.error(`[Erro Automation]:`, error);
      // Limpa contexto em caso de erro
      if (isAdmin) {
        adminContexts.delete(modelId);
      } else {
        contextInstances.delete(modelId);
      }
      return { status: "failed", message: "Erro ao abrir navegador. Tente novamente." };
    }

  } catch (error) {
    contextInstances.delete(modelId);
    console.error(`[Erro Agência]:`, error);
    return { status: "failed", message: "Erro ao iniciar sessão da modelo." };
  }
}

export async function getChatContent(modelId: number, userId: number): Promise<string | null> {
  const context = contextInstances.get(modelId);
  if (!context) return null;
  
  const page = context.pages()[0];
  if (!page) return null;

  try {
    await page.waitForSelector('main, section, [class*="Chat"]', { timeout: 10000 }).catch(() => {});

    const chatHtml = await page.evaluate(() => {
      const container = document.querySelector('main') || 
                        document.querySelector('section') || 
                        document.querySelector('[class*="chat-container"]');
      
      if (!container) return document.body.innerHTML;

      const blockers = ['header', 'nav', 'footer', '.sidebar-left', '[class*="BottomNav"]', '[class*="overlay"]'];
      blockers.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => (el as HTMLElement).style.display = 'none');
      });

      return container.innerHTML;
    });

    const styleInjection = `
      <style>
        body { background: #0f172a !important; color: white !important; margin: 0; padding: 10px; font-family: sans-serif; }
        [class*="Message"], [class*="chat-item"] { display: flex !important; opacity: 1 !important; visibility: visible !important; color: white !important; }
        img { max-width: 100%; height: auto; border-radius: 8px; }
      </style>
    `;

    return `<html><head>${styleInjection}</head><body>${chatHtml}</body></html>`
      .replace(/src="\//g, 'src="https://privacy.com.br/')
      .replace(/href="\//g, 'href="https://privacy.com.br/')
      .replace(/window\.top/gi, 'window.self');

  } catch (error) {
    console.error("[Automation] Erro na captura:", error);
    return null;
  }
}