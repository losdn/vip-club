import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStartAutomation } from "@/hooks/use-models";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Loader2, MessageSquare, RefreshCw, X, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useLocation } from "wouter";

export default function ChatterDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Estados para controle de loading local
  const [activeModelId, setActiveModelId] = useState<number | null>(null);

  // Busca dados do usuário atual (para saber se é Admin)
  const { data: user } = useQuery<any>({
    queryKey: ["/api/user"],
  });

  // Busca modelos (O Backend já vai filtrar: se for Admin, traz todas; se for Chatter, traz as permitidas)
  const { data: myModels = [], isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["/api/my-models"],
    queryFn: async () => {
      const res = await fetch("/api/my-models", { credentials: "include" });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Falha ao buscar modelos");
      }
      return await res.json() || [];
    },
    retry: 1,
  });

  const handleRefresh = async () => {
    try {
      await refetch();
      toast({ title: "Sucesso", description: "Lista de modelos atualizada." });
    } catch (err) {
      toast({ title: "Erro", description: "Falha ao atualizar.", variant: "destructive" });
    }
  };

  const { mutate: startAutomation, isPending: isStarting } = useStartAutomation();

  const handleStartSession = (modelId: number) => {
    setActiveModelId(modelId); // Marca qual está iniciando para mostrar loading no botão correto
    
    // Se for Chatter, redireciona direto para a visualização do chat se estiver validado
    if (user?.role === 'chatter') {
      const model = myModels.find((m: any) => m.id === modelId);
      
      if (model?.isValidated) {
        toast({ 
          title: "Abrindo Chat", 
          description: "Redirecionando para a janela de chat..." 
        });
        setTimeout(() => setLocation(`/chat/${modelId}`), 500);
        return;
      } else {
        toast({ 
          title: "Acesso Restrito", 
          description: "Esta modelo precisa ser validada por um administrador antes de iniciar o chat.",
          variant: "destructive"
        });
        setActiveModelId(null);
        return;
      }
    }

    startAutomation(modelId, {
      onSuccess: () => {
        toast({ 
          title: user?.role === 'admin' ? "Navegador Abrindo" : "Sessão Iniciada", 
          description: user?.role === 'admin' ? "O Chrome abrirá para o seu login." : "Redirecionando para o chat..." 
        });
        
        // Se não for admin (ou seja, é chatter), redireciona para a visualização do chat
        if (user?.role !== 'admin') {
           setTimeout(() => setLocation(`/chat/${modelId}`), 500);
        } else {
           setActiveModelId(null);
        }
      },
      onError: () => {
        setActiveModelId(null);
      }
    });
  };

  const isChatter = user?.role === 'chatter';
  const isInitialLoading = isLoading;
  const hasNoPermissions = isChatter && !isInitialLoading && myModels.length === 0;

  return (
    <div className="space-y-8 p-6">
      <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl text-white font-bold mb-2">
              {user?.role === 'admin' ? "Painel de Controle (Admin)" : "Olá! Pronto para começar?"}
            </h1>
            <p className="text-muted-foreground">
              {user?.role === 'admin' 
                ? "Inicie as sessões das modelos para realizar o login inicial." 
                : "Selecione uma modelo para iniciar o chat."}
            </p>
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

      {isInitialLoading ? (
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="text-center py-12 bg-card rounded-xl border border-dashed border-red-500/60">
          <MessageSquare className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-white">Erro ao carregar modelos</h3>
          <p className="text-muted-foreground mt-2">{error instanceof Error ? error.message : "Erro desconhecido"}</p>
        </div>
      ) : hasNoPermissions ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center animate-in fade-in zoom-in duration-500 border border-dashed border-border/40 rounded-2xl bg-black/20">
          <div className="bg-primary/10 p-6 rounded-full mb-6 ring-1 ring-primary/20">
            <Lock className="h-12 w-12 text-primary opacity-80" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Acesso Restrito</h2>
          <p className="text-muted-foreground max-w-[320px] leading-relaxed">
            No momento, você não tem permissão para visualizar nenhuma modelo. 
            <span className="block mt-2 font-semibold text-primary/90">
              Por favor, contate o administrador para liberar seu acesso.
            </span>
          </p>
          <Button variant="ghost" onClick={handleRefresh} className="mt-8 text-xs uppercase tracking-widest font-bold text-primary hover:bg-primary/10 transition-all">
            Tentar Atualizar
          </Button>
        </div>
      ) : myModels.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center border border-dashed border-border/40 rounded-2xl bg-black/20">
          <h2 className="text-2xl font-bold text-white mb-2">Nenhuma modelo disponível</h2>
          <p className="text-muted-foreground max-w-[320px] leading-relaxed">
            No momento, não há modelos cadastradas ou ativas para este painel.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {myModels.map((model: any) => (
            <Card key={model.id} className="group bg-card border-border/40 hover:border-primary/50 transition-all overflow-visible">
              <div className="h-48 relative">
                {model.cover ? (
                  <img
                    src={model.cover}
                    alt={model.name}
                    className="absolute inset-0 w-full h-full object-cover rounded-t-xl"
                  />
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
                      ${model.chatGroup === 'Chat 1' ? 'bg-cyan-500/20 text-cyan-200' : ''}
                      ${model.chatGroup === 'Chat 2' ? 'bg-pink-500/20 text-pink-200' : ''}
                      ${!['Chat 1', 'Chat 2'].includes(model.chatGroup || '') ? 'bg-black/40 text-white' : ''}
                    `}
                  >
                    {model.chatGroup || "Sem Chat"}
                  </Badge>
                </div>
              </div>
              <CardContent className="pt-10 pb-6 px-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1 group-hover:text-primary transition-colors">
                      {model.name}
                    </h3>
                    {user?.role !== 'chatter' && (
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${model.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-sm text-muted-foreground capitalize">
                          {model.status === 'active' ? 'ativo' : 'inativo'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <Button 
                  className="w-full bg-secondary hover:bg-secondary/80 text-white shadow-lg h-11 text-base font-semibold transition-all border-0"
                  onClick={() => handleStartSession(model.id)}
                  disabled={(isStarting && activeModelId === model.id) || (user?.role !== 'admin' && model.status !== 'active')}
                >
                  {isStarting && activeModelId === model.id ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Iniciando...</>
                  ) : (
                    <><Play className="w-4 h-4 mr-2 fill-current" />
                      {user?.role === 'admin' ? "Fazer Login" : "Iniciar Chat"}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
