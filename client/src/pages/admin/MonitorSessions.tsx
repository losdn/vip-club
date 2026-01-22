import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useModels } from "@/hooks/use-models";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Eye, Loader2, RefreshCw, Globe, XCircle, CheckCircle2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Model } from "@shared/schema";
import { useQueryClient } from "@tanstack/react-query";
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

export default function MonitorSessions() {
  const { data: models, isLoading, refetch, isRefetching } = useModels();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [monitoringModelId, setMonitoringModelId] = useState<number | null>(null);
  const [validatingModelId, setValidatingModelId] = useState<number | null>(null);
  const [confirmLoginModelId, setConfirmLoginModelId] = useState<number | null>(null);

  // Monitoramento global de expiração de sessão (Electron)
  useEffect(() => {
    if (window.electronAPI) {
      // Escuta eventos de expiração de sessão vindos do processo principal
      const unsubscribe = window.electronAPI.onSessionExpired((modelId) => {
        console.log(`[Monitor] Sessão expirada detectada para modelo ${modelId}`);
        
        // Atualiza o status no backend para inválido
        fetch(`/api/models/${modelId}/validate`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isValidated: false }),
            credentials: "include",
        })
        .then(() => {
            toast({
                title: "Sessão Expirada",
                description: "A sessão da modelo expirou e foi marcada como inválida.",
            });
            // Atualiza a lista de modelos na interface
            queryClient.invalidateQueries({ queryKey: ["/api/models"] });
        })
        .catch(console.error);
      });
      
      // Cleanup (embora onSessionExpired retorne void no preload atual, é boa prática se mudarmos)
      // Como o preload não retorna unsubscribe, não precisamos chamar nada aqui por enquanto
      // a menos que mudemos o preload.
    }
  }, []);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 6;
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const handleRefresh = async () => {
    try {
      await refetch();
      toast({ title: "Atualizado", description: "Lista de modelos atualizada." });
    } catch (err) {
      toast({ title: "Erro", description: "Falha ao atualizar", variant: "destructive" });
    }
  };

  const handleOpenMonitor = async (model: Model) => {
    setMonitoringModelId(model.id);
    
    // VERIFICAÇÃO ELECTRON: Se estiver no app desktop, usa o método nativo seguro
    if (window.electronAPI) {
      toast({
        title: "Abrindo Navegador",
        description: `Iniciando ambiente para ${model.name}...`,
      });

      try {
        await window.electronAPI.openModelChat({
          modelId: model.id,
          modelName: model.name,
          url: "https://privacy.com.br/Chat", // Abrir direto no Chat, mas permitindo navegação completa
          proxyUrl: model.proxyUrl || undefined,
          unrestricted: true // Força sempre o modo navegador para Admin/Monitor
        });
        setMonitoringModelId(null);
      } catch (error) {
        toast({
          title: "Erro no Navegador",
          description: "Falha ao abrir janela de chat.",
          variant: "destructive",
        });
        setMonitoringModelId(null);
      }
      return;
    }

    // COMPORTAMENTO PADRÃO (WEB/SERVIDOR)
    toast({
      title: "Abrindo Monitoramento",
      description: "Abrindo sessão de monitoramento para visualização.",
    });
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch("/api/automation/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ modelId: model.id }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const result = await response.json();

      if (response.ok && result.status === "success") {
        toast({
          title: "Monitoramento Ativo",
          description: `Monitorando sessão de ${model.name}.`,
        });
      } else {
        toast({
          title: "Erro no Monitoramento",
          description: result.message || "Não foi possível abrir o monitoramento.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        toast({
          title: "Tempo Esgotado",
          description: "Demorou muito para abrir o monitoramento. Tente novamente.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Falha ao Abrir",
          description: "Erro ao tentar abrir monitoramento. Tente novamente.",
          variant: "destructive",
        });
      }
    } finally {
      setMonitoringModelId(null);
    }
  };

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
          url: "https://privacy.com.br/Chat", // Abrir direto no Chat
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

    try {
      const response = await fetch("/api/automation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ modelId: model.id }),
      });

      const result = await response.json();

      if (response.ok && result.status === "success") {
        toast({
          title: "Navegador Aberto",
          description: `Faça login manualmente na conta da modelo ${model.name}. Depois, confirme abaixo que o login foi concluído.`,
        });
        setConfirmLoginModelId(model.id);
      } else {
        toast({
          title: "Erro no Login",
          description: result.message || "Não foi possível realizar o login.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao tentar abrir navegador para login.",
        variant: "destructive",
      });
    } finally {
      setValidatingModelId(null);
    }
  };

  const handleConfirmLogin = async (modelId: number) => {
    try {
      // ELECTRON: Capturar cookies, localStorage e User-Agent e enviar para o servidor
      if (window.electronAPI) {
        toast({ title: "Sincronizando", description: "Enviando dados da sessão para o servidor..." });
        
        try {
          const cookies = await window.electronAPI.getModelCookies({ modelId });
          const localStorage = await window.electronAPI.getModelLocalStorage({ modelId });
          const userAgent = navigator.userAgent;

          if ((cookies && cookies.length > 0) || localStorage) {
            await fetch(`/api/models/${modelId}/sync-session`, {
               method: "POST",
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify({ cookies, localStorage, userAgent }),
               credentials: "include"
            });
            console.log(`[Monitor] Sessão sincronizada para o modelo ${modelId}`);
          } else {
             console.warn(`[Monitor] Nenhum dado de sessão encontrado para enviar.`);
          }
        } catch (syncError) {
           console.error("[Monitor] Erro ao sincronizar sessão:", syncError);
           // Não interrompe o fluxo, tenta validar mesmo assim
        }
      }

      const response = await fetch(`/api/models/${modelId}/validate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isValidated: true }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Falha ao marcar sessão como validada");
      }

      await response.json().catch(() => null);

      toast({
        title: "Sessão Validada",
        description: "O login desta modelo foi marcado como válido.",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/models"] });
    } catch (error: any) {
      toast({
        title: "Erro ao Confirmar",
        description: error?.message || "Não foi possível confirmar a validação.",
        variant: "destructive",
      });
    } finally {
      setConfirmLoginModelId(null);
    }
  };

  const handleInvalidateLogin = async (model: Model) => {
    setValidatingModelId(model.id);
    
    try {
      // 1. Limpar sessão no Electron (se disponível)
      if (window.electronAPI) {
        toast({
          title: "Limpando Sessão",
          description: "Removendo dados do navegador...",
        });
        
        // Adiciona timeout para evitar travamento eterno se o Electron falhar
        const electronPromise = window.electronAPI.clearModelSession({ modelId: model.id });
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Timeout ao limpar sessão no Electron")), 8000)
        );
        
        try {
            await Promise.race([electronPromise, timeoutPromise]);
        } catch (e) {
            console.error("[Monitor] Aviso: Falha ou timeout ao limpar sessão Electron:", e);
            // Não interrompe, pois o servidor fará a limpeza pesada
        }
      }

      // 2. Atualizar status no banco de dados (com timeout)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

      try {
        const response = await fetch(`/api/models/${model.id}/validate`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isValidated: false }),
            credentials: "include",
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error("Falha ao invalidar login no servidor");
        }

        await response.json().catch(() => null);
      } catch (fetchError: any) {
        if (fetchError.name === 'AbortError') {
            console.error("[Monitor] Timeout na requisição de invalidação");
            // Mesmo com timeout, o servidor pode ter processado. 
            // Vamos assumir sucesso parcial ou pedir para tentar de novo.
            throw new Error("O servidor demorou muito para responder. Verifique se a sessão foi limpa.");
        }
        throw fetchError;
      }

      toast({
        title: "Sessão Invalidada",
        description: "O login desta modelo foi invalidado.",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/models"] });
    } catch (error: any) {
      toast({
        title: "Erro ao Invalidar",
        description: error?.message || "Não foi possível invalidar o login.",
        variant: "destructive",
      });
    } finally {
      setValidatingModelId(null);
    }
  };

  const allModels = models || [];

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredModels = allModels
    .filter((model: any) => {
      if (!normalizedSearch) return true;
      return model.name.toLowerCase().includes(normalizedSearch);
    })
    .sort((a: any, b: any) => {
      // Ordenar por validado (true) primeiro
      const aVal = (a as any).isValidated ? 1 : 0;
      const bVal = (b as any).isValidated ? 1 : 0;
      if (aVal !== bVal) {
        return bVal - aVal; // 1 vem antes de 0 (decrescente)
      }
      // Desempate por nome alfabético
      return a.name.localeCompare(b.name);
    });

  const totalPages = Math.max(1, Math.ceil(filteredModels.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedModels = filteredModels.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <div className="space-y-8 p-6">
      <AlertDialog open={!!confirmLoginModelId} onOpenChange={() => setConfirmLoginModelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmação de Login</AlertDialogTitle>
            <AlertDialogDescription>
              O navegador foi aberto e você realizou o login na conta da modelo?
              <br />
              <br />
              Ao confirmar, a sessão será marcada como validada e o monitoramento será liberado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ainda não</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmLoginModelId) {
                  handleConfirmLogin(confirmLoginModelId);
                }
              }}
            >
              Sim, login realizado
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl text-white font-bold mb-2">
            {user?.role === 'supervisor'
              ? "Monitoramento e Chat"
              : "Validação e Monitoramento de Chats"}
          </h1>
          <p className="text-muted-foreground">
            {user?.role === 'supervisor'
              ? "Acesse as sessões ativas para monitoramento e chat"
              : "Valide sessões e acesse as sessões ativas para monitoramento"}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative min-w-[280px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filtrar por nome da modelo"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 bg-secondary/40 border-border/50 text-sm"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading || isRefetching}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${(isLoading || isRefetching) ? 'animate-spin' : ''}`} />
            {isRefetching ? 'Atualizando...' : 'Atualizar'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : allModels.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center border border-dashed border-border/40 rounded-2xl bg-black/20">
            <p className="text-muted-foreground">Nenhuma modelo encontrada.</p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedModels.map((model: Model) => {
             const isMonitoring = monitoringModelId === model.id;
             const isActive = model.status === 'active';
             const isValidated = (model as any).isValidated;
             
            return (
             <Card 
               key={model.id} 
               className="group bg-card transition-all overflow-visible border border-border/40 hover:border-primary/40"
             >
                <div className="h-48 relative">
                  {model.cover ? (
                    <img src={model.cover} alt="" className="absolute inset-0 w-full h-full object-cover rounded-t-xl" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-r from-secondary to-card rounded-t-xl" />
                  )}
                  <div className="absolute inset-0 bg-black/20 rounded-t-xl" />
                  <div className="absolute -bottom-6 left-6 z-20">
                    <div className="w-20 h-20 rounded-xl border-4 border-card bg-secondary overflow-hidden shadow-lg">
                      {model.avatar ? (
                        <img src={model.avatar} alt={model.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white font-bold text-xl uppercase">
                          {model.name.charAt(0)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="absolute top-4 right-4 z-10">
                    <Badge 
                      variant="outline" 
                      className={`
                        backdrop-blur-sm border-transparent
                        ${model.chatGroup === 'Chat 1' ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10' : ''}
                        ${model.chatGroup === 'Chat 2' ? 'border-pink-500 text-pink-400 bg-pink-500/10' : ''}
                        ${!['Chat 1', 'Chat 2'].includes(model.chatGroup || '') ? 'border-gray-500 text-gray-400 bg-gray-500/10' : ''}
                      `}
                    >
                      {model.chatGroup || "Sem Chat"}
                    </Badge>
                  </div>
                </div>
                <CardContent className="pt-10 pb-6 px-6">
                  <div className="flex justify-between items-start mb-6">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-white group-hover:text-primary transition-colors">
                        {model.name}
                      </h3>
                      {user?.role === 'supervisor' && (
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isValidated ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span className="text-sm text-muted-foreground">
                            {isValidated ? 'Validada' : 'Invalidada'}
                          </span>
                        </div>
                      )}
                    </div>
                    {isValidated && (
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    )}
                  </div>
                  <div
                    className={`
                      rounded-lg mb-2
                      ${isValidated ? 'bg-emerald-500/5' : 'bg-red-500/5'}
                    `}
                  >
                    <Button 
                      className="w-full bg-secondary hover:bg-secondary/80 text-white shadow-lg h-11 text-base font-semibold transition-all border-0"
                      onClick={() => {
                        if (!isValidated) {
                          toast({
                            title: "Erro no Monitoramento",
                            description: "Login não validado. Por favor, valide o login antes de monitorar.",
                            variant: "destructive",
                          });
                          return;
                        }
                        handleOpenMonitor(model);
                      }}
                      disabled={isMonitoring || !isActive}
                    >
                      {isMonitoring ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Abrindo...</>
                      ) : (
                        <><Eye className="w-4 h-4 mr-2" />Monitorar</>
                      )}
                    </Button>
                  </div>
                  {(user?.role === 'admin' || user?.role === 'dev') && (
                    <Button 
                      className={`
                        w-full mt-3 h-11 text-base font-semibold transition-all
                        ${isValidated 
                          ? "border border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500/20" 
                          : "bg-secondary hover:bg-secondary/80 text-white shadow-lg border-0"
                        }
                      `}
                      onClick={() => isValidated ? handleInvalidateLogin(model) : handleOpenBrowserForLogin(model)}
                      disabled={validatingModelId === model.id}
                    >
                      {validatingModelId === model.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Atualizando...
                        </>
                      ) : isValidated ? (
                        <>
                          <XCircle className="w-4 h-4 mr-2" />
                          Invalidar Login
                        </>
                      ) : (
                        <>
                          <Globe className="w-4 h-4 mr-2" />
                          Validar Login
                        </>
                      )
                      }
                    </Button>
                  )}
                  {(user?.role === 'supervisor') && (
                    <Button 
                      className="w-full mt-3 bg-secondary hover:bg-secondary/80 text-white shadow-lg h-11 text-base font-semibold transition-all border-0"
                      onClick={() => {
                        if (!model.isValidated) {
                          toast({
                            title: "Erro no Monitoramento",
                            description: "Sessão inválida ou expirada. Valide o login desta modelo antes de monitorar.",
                            variant: "destructive",
                          });
                          return;
                        }
                        setLocation(`/chat/${model.id}`);
                      }}
                      disabled={!isActive}
                    >
                      Ver Chat
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        {filteredModels.length > ITEMS_PER_PAGE && (
          <div className="flex items-center justify-end gap-3 mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={safePage === 1}
            >
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Página {safePage} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={safePage === totalPages}
            >
              Próxima
            </Button>
          </div>
        )}
        </>
      )}
    </div>
  );
}
