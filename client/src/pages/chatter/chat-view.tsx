import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCcw, X, AlertCircle, Globe, RefreshCw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMyModels } from "@/hooks/use-models";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function ChatView() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const modelId = id ? Number(id) : null;
  const { data: myModels, isLoading: isLoadingModels } = useMyModels();
  const models = Array.isArray(myModels) ? myModels : [];
  const cachedModel = models.find((m: any) => m.id === modelId);
  const displayName = cachedModel?.name || "Chat";
  const webviewRef = useRef<any>(null);

  const [isSessionReady, setIsSessionReady] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [webviewLoading, setWebviewLoading] = useState(true);

  useEffect(() => {
    if (!modelId || isLoadingModels) return;

    // Validação de acesso
    const currentModel = models.find((m: any) => m.id === modelId);
    if (currentModel && !currentModel.isValidated) {
      toast({
        title: "Acesso Negado",
        description: "Esta modelo não possui login validado pelo administrador.",
        variant: "destructive",
      });
      setLocation("/dashboard");
      return;
    }

    // Prepara a sessão (injeta cookies) antes de montar o webview
    const prepareSession = async () => {
      setIsStarting(true);
      setWebviewLoading(true);
      try {
        if ((window as any).electronAPI) {
          // Tentar sincronizar sessão
          try {
            const response = await fetch(`/api/models/${modelId}/sync-session`);
            if (response.ok) {
              const sessionData = await response.json();
              if ((window as any).electronAPI.injectModelSession) {
                await (window as any).electronAPI.injectModelSession({
                  modelId: modelId,
                  cookies: sessionData.cookies,
                  userAgent: sessionData.userAgent,
                  proxyUrl: cachedModel?.proxyUrl // Passando o Proxy do banco de dados
                });
                console.log("[ChatView] Sessão sincronizada com Proxy.");
              }
            }
          } catch (e) {
            console.error("[ChatView] Erro ao sincronizar sessão:", e);
          }
        }
      } catch (error) {
        console.error("Erro ao preparar sessão:", error);
      } finally {
        setIsSessionReady(true);
        setIsStarting(false);
      }
    };

    prepareSession();
  }, [modelId, isLoadingModels, models, toast, setLocation]);

  // Listener para eventos do Webview
    useEffect(() => {
      const webview = webviewRef.current;
      if (webview && isSessionReady) {
        const handleStartLoading = () => setWebviewLoading(true);
        const handleStopLoading = () => setWebviewLoading(false);
        const handleDomReady = () => {
           setWebviewLoading(false);
           // Injetar CSS para limpar a interface do site da Privacy (remover header/sidebar nativos do site)
            // Tenta remover o header global e ajustar o layout para ocupar 100% do container
            webview.insertCSS(`
               /* Ocultar cabeçalho global (Logo Privacy, Barra de pesquisa superior) */
               header, nav[role="banner"], div[class*="header" i], .navbar {
                  display: none !important;
               }
               
               /* Ocultar sidebar global se houver */
               aside, .sidebar {
                  display: none !important;
               }

               /* RESET TOTAL DE LAYOUT E CORES PARA FUNDIR COM O APP */
               html, body, #root, #__next {
                  height: 100vh !important;
                  width: 100vw !important;
                  overflow: hidden !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  background-color: #13131f !important; /* Fundo base Roxo Escuro */
                  max-width: none !important;
                  transform: none !important; /* Evitar criar novo contexto de empilhamento */
               }

               /* REMOVER TRANSFORMS QUE QUEBRAM POSITION FIXED DO INPUT */
               #__next, #root, .main-layout, div[class*="layout"], section, main {
                  transform: none !important;
                  perspective: none !important;
                  filter: none !important;
                  contain: none !important;
               }

               /* REMOVER LIMITES DE LARGURA (MAX-WIDTH) DE TODOS OS CONTAINERS */
               .container, div[class*="container"], div[class*="wrapper"], section, main, div[class*="content"] {
                   max-width: none !important;
                   width: 100% !important;
                   margin: 0 !important;
                   padding-left: 0 !important;
                   padding-right: 0 !important;
               }

               /* Forçar container principal a ocupar tudo */
               #__next, #root, .main-layout {
                  display: flex !important;
                  flex-direction: column !important;
                  justify-content: space-between !important;
                  width: 100% !important;
                  height: 100% !important;
                  max-width: none !important;
               }

               /* ÁREA DE MENSAGENS: Ocupar espaço e permitir scroll */
               main, div[class*="chat-list"], div[class*="message-list"], .scroll-container {
                  flex: 1 !important;
                  height: 100% !important;
                  width: 100% !important;
                  max-width: none !important;
                  overflow-y: auto !important;
                  background-color: #13131f !important;
                  padding-bottom: 100px !important; /* Espaço extra para o input não cobrir */
               }

               /* ÁREA DE INPUT (Formulário): Fixar no fundo e estilizar */
               form, footer, div[class*="input-area"], div[class*="chat-controls"], div[class*="footer"] {
                   position: fixed !important;
                   bottom: 0px !important;
                   left: 0 !important;
                   right: 0 !important;
                   width: 100vw !important;
                   max-width: none !important;
                   margin: 0 !important;
                   margin-bottom: 0 !important;
                   padding: 10px !important;
                   padding-bottom: 10px !important;
                   background-color: #1c1433 !important; /* Roxo ligeiramente mais claro para destaque */
                   border-top: 1px solid #2e1065 !important;
                   z-index: 2147483647 !important; /* Z-Index Máximo */
                   box-shadow: 0 -4px 20px rgba(0,0,0,0.5) !important;
                   min-height: auto !important; /* Altura automática para não sobrar espaço */
                   height: auto !important;
                   display: flex !important;
                   align-items: center !important;
                   transform: none !important;
               }

               /* Remover qualquer padding ou margem do body que possa empurrar o input pra cima */
               body {
                   padding-bottom: 0 !important;
                   margin-bottom: 0 !important;
               }

               /* Esconder banners de app ou cookies que possam ficar no rodapé */
               div[class*="banner"], div[class*="cookie"], div[class*="app-install"] {
                   display: none !important;
               }

               /* Esconder elementos fantasmas no rodapé que criam espaço cinza */
               div[class*="footer-spacer"], .spacer {
                   display: none !important;
               }

               /* ESTILIZAÇÃO DE ELEMENTOS INTERNOS PARA O TEMA ROXO */
               
               /* Scrollbar */
               ::-webkit-scrollbar {
                  width: 6px !important;
               }
               ::-webkit-scrollbar-thumb {
                  background: #7c3aed !important;
                  border-radius: 3px !important;
               }
               ::-webkit-scrollbar-track {
                  background: #0f0f15 !important;
               }

               /* Inputs de texto */
               textarea, input[type="text"] {
                  background-color: #0f0f15 !important;
                  color: #e9d5ff !important;
                  border: 1px solid #4c1d95 !important;
                  border-radius: 12px !important;
               }
               
               /* Balões de mensagem (Tentativa de estilizar genérico) */
               div[class*="message-bubble"], div[class*="bubble"] {
                   border-radius: 12px !important;
               }

               /* Links */
               a { color: #a78bfa !important; }
            `).catch((e: any) => console.error("Erro ao injetar CSS:", e));
         };

        webview.addEventListener('did-start-loading', handleStartLoading);
        webview.addEventListener('did-stop-loading', handleStopLoading);
        webview.addEventListener('dom-ready', handleDomReady);

        // Tenta forçar recarregamento se necessário ao montar
        if (webview.getWebContentsId) {
           // Webview está pronto
        }

        return () => {
          webview.removeEventListener('did-start-loading', handleStartLoading);
          webview.removeEventListener('did-stop-loading', handleStopLoading);
          webview.removeEventListener('dom-ready', handleDomReady);
        };
      }
    }, [isSessionReady, modelId]);

  const handleRefreshSession = () => {
     if (webviewRef.current) {
         webviewRef.current.reload();
     } else {
         setIsSessionReady(false);
         setTimeout(() => setIsSessionReady(true), 100);
     }
  };

  return (
    <div className="h-full w-full bg-[#13131f] flex flex-col overflow-hidden">
      <header className="flex justify-between items-center w-full px-8 h-24 shrink-0 border-b border-purple-500/10 bg-gradient-to-r from-[#13131f] via-[#1c1433] to-[#13131f] backdrop-blur-md mb-0 z-20 relative shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="bg-purple-500/20 p-2 rounded-lg border border-purple-500/30 shadow-[0_0_15px_rgba(147,51,234,0.3)]">
               <RefreshCw className="w-5 h-5 text-purple-400 animate-pulse-slow" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-purple-200 drop-shadow-sm">
              {modelId ? "Chat Ao Vivo" : "Central de Atendimento"}
            </h1>
          </div>
          <p className="text-purple-200/60 text-xs font-medium pl-14 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_#22c55e]"></span>
            {modelId
              ? `Conectado como: ${displayName}`
              : "Aguardando seleção..."}
          </p>
        </div>

        <div className="flex items-center gap-3 mt-6">
          {Array.isArray(models) && models.length > 0 && (
            <Select
              value={modelId ? String(modelId) : undefined}
              onValueChange={(value) => {
                const nextId = Number(value);
                if (!Number.isNaN(nextId) && nextId !== modelId) {
                  setIsSessionReady(false); // Reset para forçar reload do webview
                  setLocation(`/chat/${nextId}`);
                }
              }}
            >
              <SelectTrigger className="w-48 bg-[#0a0a14] border-white/10 text-xs text-white h-8">
                <SelectValue placeholder="Trocar modelo" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m: any) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <button
            onClick={handleRefreshSession}
            disabled={!modelId}
            className="flex items-center gap-2 px-3 py-1.5 border border-white/20 rounded-lg text-white text-xs font-semibold hover:bg-white/5 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed h-8"
          >
            <RefreshCcw className="w-3 h-3" />
            Recarregar
          </button>
        </div>
      </header>

      <div className="flex-1 w-full bg-black relative flex flex-col shadow-none overflow-hidden border-t border-white/5">
        <div className="h-8 bg-[#0f0f1a] px-4 flex justify-between items-center z-10 relative border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-[#9333ea]/20 border border-[#9333ea]/50 px-2 h-5 flex items-center justify-center rounded-full min-w-[40px]">
              <span className="text-[9px] text-[#c084fc] font-bold uppercase tracking-wider text-center leading-none">
                Chat
              </span>
            </div>
            <span className="text-white text-[10px] font-bold tracking-tight">
              {displayName}
            </span>
          </div>

          <button 
            className="group"
            onClick={() => {
              if (user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'dev') {
                setLocation('/admin/monitor');
              } else {
                setLocation('/dashboard');
              }
            }}
          >
            <X className="w-3.5 h-3.5 text-red-500/80 transition-transform group-hover:scale-110" />
          </button>
        </div>

        <div className="flex-1 bg-[#13131f] relative w-full h-full overflow-hidden">
          {modelId && isSessionReady ? (
            <>
                {/* @ts-ignore - Webview tag is native to Electron */}
                <webview
                    ref={webviewRef}
                    src="https://privacy.com.br/Chat"
                    partition={`persist:model_${modelId}`}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none', display: 'flex' }}
                    useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    allowpopups={true}
                    webpreferences="contextIsolation=true, nodeIntegration=false"
                />
                
                {webviewLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#060610]/80 backdrop-blur-sm z-20">
                         <Loader2 className="w-10 h-10 animate-spin text-purple-500 mb-4" />
                         <p className="text-white font-medium">Carregando chat...</p>
                    </div>
                )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-8 h-full">
               {isStarting ? (
                 <>
                   <Loader2 className="w-12 h-12 animate-spin text-purple-500 mb-6" />
                   <h3 className="text-xl font-medium text-white mb-2">Sincronizando Sessão...</h3>
                   <p className="text-gray-400">Preparando ambiente seguro para o chat.</p>
                 </>
               ) : (
                 <>
                   <div className="bg-purple-500/10 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 border border-purple-500/20">
                     <Globe className="w-12 h-12 text-purple-400" />
                   </div>
                   <h2 className="text-2xl font-bold text-white mb-2">Selecione uma Modelo</h2>
                   <p className="text-gray-400 max-w-md mx-auto">
                     Escolha uma modelo no menu acima para iniciar o atendimento.
                   </p>
                 </>
               )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
