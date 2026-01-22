import { useState, useEffect } from "react";
import { useModels } from "@/hooks/use-models";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Globe, XCircle, BadgeInfo } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Model } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function ValidateModels() {
  const { data: models, isLoading } = useModels();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [validatingModelId, setValidatingModelId] = useState<number | null>(null);
  const [confirmLoginModelId, setConfirmLoginModelId] = useState<number | null>(null);
  const [invalidateModelId, setInvalidateModelId] = useState<number | null>(null);

  const handleOpenBrowserForLogin = async (model: Model) => {
    setValidatingModelId(model.id);
    
    // VERIFICAÇÃO ELECTRON: Se estiver no app desktop, usa o método nativo seguro
    if (window.electronAPI) {
      toast({
        title: "Preparando Ambiente",
        description: `Limpando sessão anterior de ${model.name} para login limpo...`,
      });

      try {
        // 1. Limpa qualquer sessão existente para garantir que venha deslogado
        await window.electronAPI.clearModelSession({ modelId: model.id });

        toast({
          title: "Abrindo Login",
          description: `Abrindo janela segura para login de ${model.name}...`,
        });

        await window.electronAPI.openModelChat({
          modelId: model.id,
          modelName: model.name,
          url: "https://privacy.com.br/Chat",
          proxyUrl: model.proxyUrl || undefined,
          unrestricted: true // Força o modo navegador (com toolbar) para validação
        });
        
        toast({
          title: "Janela Aberta",
          description: `Faça login na janela do navegador e depois confirme aqui.`,
        });
        setConfirmLoginModelId(model.id);
      } catch (error) {
        toast({
          title: "Erro no Navegador",
          description: "Falha ao abrir janela de login.",
          variant: "destructive",
        });
      } finally {
        setValidatingModelId(null);
      }
      return;
    }

    // --- COMPORTAMENTO PADRÃO (WEB/SERVIDOR) ---

    // Toast informativo ao iniciar
    toast({
      title: "Abrindo Navegador",
      description: "Navegador da modelo será aberto. Faça login manualmente.",
    });
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch("/api/automation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ modelId: model.id }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const result = await response.json();

      if (response.ok && result.status === "success") {
        // NÃO confirma imediatamente - aguarda login manual
        toast({
          title: "Navegador Aberto",
          description: `Faça login manualmente na conta da modelo ${model.name}. A validação será confirmada após o login.`,
        });
        
        // Abre diálogo de confirmação
        setConfirmLoginModelId(model.id);
        
      } else {
        toast({
          title: "Erro ao Abrir Navegador",
          description: result.message || "Não foi possível abrir o navegador.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        toast({
          title: "Tempo Esgotado",
          description: "Demorou muito para abrir o navegador. Tente novamente.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Falha ao Abrir",
          description: "Erro ao tentar abrir navegador. Tente novamente.",
          variant: "destructive",
        });
      }
    } finally {
      setValidatingModelId(null);
    }
  };

  const handleConfirmLogin = async (modelId: number) => {
    try {
      // 1. Se estiver no Electron, captura os cookies e envia para o backend (SYNC)
      if (window.electronAPI) {
        toast({ title: "Sincronizando", description: "Copiando sessão segura para o servidor..." });
        try {
          // Passando o objeto corretamente como esperado pelo main.js
          const cookies = await window.electronAPI.getModelCookies({ modelId });
          const localStorage = await window.electronAPI.getModelLocalStorage({ modelId });
          const userAgent = navigator.userAgent;
          
          if ((cookies && cookies.length > 0) || localStorage) {
            await fetch(`/api/models/${modelId}/sync-session`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cookies, localStorage, userAgent }),
            });
            console.log(`[Frontend] Sessão sincronizada: ${cookies?.length || 0} cookies, LocalStorage e UA.`);
          } else {
             console.warn("[Frontend] Nenhum dado de sessão capturado do Electron.");
          }
          
          // Fecha a janela após confirmar
          // await window.electronAPI.closeModelChat({ modelId });
        } catch (e) {
          console.error("[Frontend] Falha ao sincronizar cookies:", e);
          // Não bloqueia a validação, mas avisa
        }
      }

      await fetch(`/api/models/${modelId}/validate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isValidated: true }),
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/models"] });
      
      toast({
        title: "Sucesso",
        description: "Sessão validada e sincronizada.",
        variant: "default",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Falha ao salvar validação.",
        variant: "destructive",
      });
    } finally {
      setConfirmLoginModelId(null);
    }
  };

  const handleInvalidateSession = async (modelId: number) => {
    try {
      // 1. Limpar sessão no Electron (se disponível)
      if (window.electronAPI) {
        await window.electronAPI.clearModelSession({ modelId });
        toast({
          title: "Sessão Limpa",
          description: "Os dados de navegação foram removidos do App.",
        });
      }

      // 2. Atualizar status no banco de dados
      const response = await fetch(`/api/models/${modelId}/validate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isValidated: false }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Falha ao invalidar sessão");
      }

      await response.json().catch(() => null);

      toast({
        title: "Sessão Invalidada",
        description: "A modelo precisará ser validada novamente.",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/models"] });
    } catch (error: any) {
      toast({
        title: "Erro ao Invalidar",
        description: error?.message || "Não foi possível invalidar a sessão.",
        variant: "destructive",
      });
    } finally {
      setInvalidateModelId(null);
    }
  };

  // Monitoramento global de expiração de sessão (Electron)
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onSessionExpired((modelId) => {
        console.log(`[Monitor] Sessão expirada detectada para modelo ${modelId}`);
        handleInvalidateSession(modelId);
      });
    }
  }, []);

  const activeModels = models?.filter((m: Model) => m.status === "active") || [];

  return (
    <div className="space-y-8">
      <AlertDialog open={!!confirmLoginModelId} onOpenChange={() => setConfirmLoginModelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmação de Login</AlertDialogTitle>
            <AlertDialogDescription>
              O navegador foi aberto. Você realizou o login com sucesso na conta da modelo?
              <br/><br/>
              Ao confirmar, o sistema assumirá que a sessão está ativa e pronta para uso pelos chatters.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ainda não</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => confirmLoginModelId && handleConfirmLogin(confirmLoginModelId)}
              className="bg-green-600 hover:bg-green-700"
            >
              Sim, Login Realizado
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para Invalidar Sessão */}
      <AlertDialog open={!!invalidateModelId} onOpenChange={() => setInvalidateModelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invalidar Sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso indicará que a sessão da modelo não está mais válida (expirou ou logout realizado).
              <br/><br/>
              Os chatters não poderão usar a automação até que um novo login seja validado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => invalidateModelId && handleInvalidateSession(invalidateModelId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Confirmar Invalidação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl text-white font-bold mb-2">Validar Sessões das Modelos</h1>
          <p className="text-muted-foreground">
            Realize o login nas contas das modelos. Após validar, os chatters poderão iniciar conversas automaticamente.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/40 border border-border/60 text-xs text-muted-foreground">
          <BadgeInfo className="w-3 h-3" />
          <span>Use esta tela apenas para validar logins</span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : activeModels.length === 0 ? (
        <Card className="bg-card border-border/40">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Nenhuma modelo ativa encontrada. Cadastre modelos na seção "Modelos".
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          {activeModels.map((model: Model) => {
            const isValidating = validatingModelId === model.id;
            // @ts-ignore - isValidated property is new
            const isValidated = model.isValidated;

            return (
              <Card 
                key={model.id} 
                className={`group bg-card border-border/40 transition-all duration-200 overflow-hidden ${isValidated ? 'border-emerald-500/40' : 'hover:border-primary/50'}`}
              >
                <div className="h-32 relative rounded-t-xl">
                  {model.cover ? (
                    <img 
                      src={model.cover} 
                      alt="" 
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-r from-secondary/60 to-card/60" />
                  )}
                  <div className="absolute inset-0 bg-black/30" />
                  <div className="absolute -bottom-6 left-6 z-20">
                    <div className="w-20 h-20 rounded-xl border-4 border-card bg-secondary overflow-hidden shadow-lg flex items-center justify-center text-lg font-semibold">
                      {model.avatar ? (
                        <img 
                          src={model.avatar} 
                          alt={model.name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-white">{model.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                  </div>
                </div>
                <CardContent className="pt-10 pb-6 px-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="min-w-0">
                      <h3 className="text-white font-semibold truncate group-hover:text-primary transition-colors">
                        {model.name}
                      </h3>
                      <span
                        className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${
                          isValidated
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40"
                            : "bg-red-500/10 text-red-400 border-red-500/40"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                            isValidated ? "bg-emerald-400" : "bg-red-400"
                          }`}
                        />
                        {isValidated ? "Sessão Validada" : "Sessão Inválida"}
                      </span>
                    </div>
                    {isValidated && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    )}
                  </div>

                  <div className="space-y-3">
                    <Button
                      onClick={() => isValidated ? setInvalidateModelId(model.id) : handleOpenBrowserForLogin(model)}
                      disabled={isValidating}
                      variant={isValidated ? "destructive" : "default"}
                      className={`w-full h-11 text-sm font-semibold ${isValidated 
                        ? "bg-red-600 hover:bg-red-700 text-white border-0" 
                        : "bg-primary/90 hover:bg-primary text-white border-0 shadow-md"
                      }`}
                    >
                      {isValidating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Validando...
                        </>
                      ) : isValidated ? (
                        <>
                          <XCircle className="w-4 h-4 mr-2" />
                          Invalidar Sessão
                        </>
                      ) : (
                        <>
                          <Globe className="w-4 h-4 mr-2" />
                          Validar Login
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
