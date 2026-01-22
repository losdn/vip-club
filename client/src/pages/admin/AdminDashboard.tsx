import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useUsers } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { useModels } from "@/hooks/use-models";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, Activity, Users, Video, ShieldCheck, Loader2, CheckCircle2, Eye, Globe, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, XCircle, Calendar as CalendarIcon, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { Model } from "@shared/schema";

function formatLogTimestamp(raw: string | number | Date) {
  const date = new Date(raw);
  const adjusted = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return adjusted.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
    timeZone: "America/Sao_Paulo"
  });
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: models } = useModels();
  const { toast } = useToast();
  const [validatingModelId, setValidatingModelId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 7;

  const { data: systemStats } = useQuery({
    queryKey: ["/api/stats/system"],
    queryFn: async () => {
      const res = await fetch("/api/stats/system");
      if (!res.ok) throw new Error("Falha ao buscar status");
      return res.json();
    },
    refetchInterval: 5000 // Atualiza a cada 5s
  });

  const { data: maintenanceData, refetch: refetchMaintenance } = useQuery({
    queryKey: ["/api/system/maintenance"],
    queryFn: async () => {
      const res = await fetch("/api/system/maintenance");
      if (!res.ok) throw new Error("Falha ao buscar status de manutenção");
      return res.json();
    },
    refetchInterval: 2000, // Check every 2 seconds
    staleTime: 0
  });

  // Se enabled for true, significa que o modo manutenção está ATIVO, logo o sistema está OFFLINE.
  // Se enabled for false (ou undefined), o sistema está ONLINE.
  const isSystemOnline = !maintenanceData?.enabled;

  const { data: activity = [], refetch: refetchActivity } = useQuery({
    queryKey: ["/api/system/activity"],
    queryFn: async () => {
      const res = await fetch("/api/system/activity", { credentials: "include" });
      if (!res.ok) return [];
      return await res.json();
    },
    refetchInterval: 5000
  });

  const toggleSystemStatus = async () => {
    if (user?.role !== 'dev') return;
    
    try {
      // Se está online, queremos ativar o modo manutenção (enabled = true)
      // Se está offline, queremos desativar o modo manutenção (enabled = false)
      const newMaintenanceState = isSystemOnline;

      const res = await fetch("/api/system/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newMaintenanceState }),
        credentials: "include"
      });
      
      if (!res.ok) {
        let errorMessage = "Falha ao atualizar status";
        try {
          const errorData = await res.json();
          errorMessage = errorData.details || errorData.message || errorMessage;
        } catch (e) {
          const text = await res.text().catch(() => "");
          if (text) errorMessage = `Erro (${res.status}): ${text.substring(0, 50)}`;
          else errorMessage = `Erro (${res.status}): Falha na comunicação`;
        }
        throw new Error(errorMessage);
      }
      
      await Promise.all([
        refetchMaintenance(),
        refetchActivity()
      ]);
      
      toast({
        title: !newMaintenanceState ? "Sistema Online" : "Modo Manutenção Ativado",
        description: !newMaintenanceState ? "O servidor está online novamente." : "O servidor está agora em modo de manutenção.",
        variant: !newMaintenanceState ? "default" : "destructive"
      });
    } catch (error: any) {
      console.error("Erro ao atualizar status do sistema:", error);
      toast({
        title: "Erro",
        description: error?.message || "Não foi possível atualizar o status do sistema.",
        variant: "destructive"
      });
    }
  };

  const handleOpenBrowserForLogin = async (model: Model) => {
    setValidatingModelId(model.id);
    
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
          description: `Faça login manualmente na conta da modelo ${model.name}.`,
        });
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

  const handleOpenMonitor = async (model: Model) => {
    // @ts-ignore - isValidated property might be missing in type definition
    if (!model.isValidated) {
      toast({
        title: "Erro no Monitoramento",
        description: "Sessão inválida ou expirada. Valide o login desta modelo antes de monitorar.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Abrindo Monitoramento",
      description: `Abrindo janela de monitoramento para ${model.name}...`,
    });

    try {
      const response = await fetch("/api/automation/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ modelId: model.id }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Falha ao abrir monitor");
      }

      toast({
        title: "Sucesso",
        description: "Janela de monitoramento aberta.",
      });
    } catch (e: any) {
      toast({
        title: "Erro",
        description: e.message || "Não foi possível abrir o monitoramento.",
        variant: "destructive"
      });
    }
  };

  const activeModels = models?.filter((m: Model) => m.status === "active") || [];

  const stats = [
    {
      title: "Total de Usuários",
      value: systemStats?.counts?.users ?? 0,
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-500/10"
    },
    {
      title: "Modelos Gerenciadas",
      value: systemStats?.counts?.models ?? 0,
      icon: Video,
      color: "text-purple-500",
      bg: "bg-purple-500/10"
    },
    {
      title: "Permissões Ativas",
      value: systemStats?.counts?.permissions ?? 0,
      icon: ShieldCheck,
      color: "text-green-500",
      bg: "bg-green-500/10"
    },
    {
      title: "Status do Sistema",
      value: isSystemOnline ? "Online" : "Offline",
      icon: isSystemOnline ? CheckCircle2 : XCircle,
      color: isSystemOnline ? "text-emerald-500" : "text-red-500",
      bg: isSystemOnline ? "bg-emerald-500/10" : "bg-red-500/10",
      isInteractive: user?.role === 'dev',
      onClick: toggleSystemStatus
    }
  ];

  const historyData = systemStats?.sessions?.history || [];
  const [dateFilter, setDateFilter] = useState<{ start: string; end: string }>({
    start: "",
    end: ""
  });
  const [activityDateFilter, setActivityDateFilter] = useState<{ start: string; end: string }>({
    start: "",
    end: ""
  });
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // Pagination for Activity Log
  const [activityPage, setActivityPage] = useState(1);
  const ACTIVITY_ITEMS_PER_PAGE = 7;
  const [activitySortOrder, setActivitySortOrder] = useState<"desc" | "asc">("desc");

  const handleResetAccessLogs = async () => {
    try {
      const res = await fetch("/api/system/activity/reset", {
        method: "POST",
        credentials: "include"
      });
      if (!res.ok) throw new Error("Falha ao resetar histórico");
      toast({ title: "Histórico de acesso resetado", description: "O histórico de acesso foi limpo com sucesso." });
      await Promise.all([
        refetchActivity()
      ]);
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Não foi possível resetar o histórico.", variant: "destructive" });
    }
  };

  const { refetch: refetchSystemStats } = useQuery({
    queryKey: ["/api/stats/system", dateFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFilter.start) params.set("start", dateFilter.start);
      if (dateFilter.end) params.set("end", dateFilter.end);
      const url = `/api/stats/system?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Falha ao buscar status");
      return res.json();
    },
    refetchInterval: 5000
  });

  const sortedHistory = [...historyData].sort((a: any, b: any) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    return sortOrder === "desc" ? (tb - ta) : (ta - tb);
  });
  const totalPages = Math.ceil(sortedHistory.length / ITEMS_PER_PAGE);
  const currentHistory = sortedHistory.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const chatActivityLogs = [...activity]
    .filter((log: any) => {
      if (log.type !== "info") return false;
      const msg = (log.message || "").toLowerCase();
      if (!msg) return false;
      if (!["chatter", "supervisor"].includes(log.role)) return false;
      if (
        !(
          msg.includes("entrou no chat de") ||
          msg.includes("saiu do chat de")
        )
      ) {
        return false;
      }
      if (msg.includes("chat de suporte")) return false;
      return true;
    })
    .sort((a: any, b: any) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return activitySortOrder === "desc" ? tb - ta : ta - tb;
    });

  const filteredChatActivityLogs = chatActivityLogs.filter((log: any) => {
    const ts = new Date(log.timestamp).getTime();
    if (activityDateFilter.start) {
      const startTs = new Date(`${activityDateFilter.start}T00:00:00`).getTime();
      if (ts < startTs) return false;
    }
    if (activityDateFilter.end) {
      const endTs = new Date(`${activityDateFilter.end}T23:59:59`).getTime();
      if (ts > endTs) return false;
    }
    return true;
  });

  const generalActivityLogs = [...activity]
    .filter((log: any) => {
      if (log.type !== "info") return false;
      const msg = (log.message || "").toLowerCase();
      if (!msg) return false;
      if (!["chatter", "supervisor"].includes(log.role)) return false;
      if (
        !(
          msg.includes("logou no sistema") ||
          msg.includes("saiu do sistema")
        )
      ) {
        return false;
      }
      if (msg.includes("chat de suporte")) return false;
      return true;
    })
    .sort((a: any, b: any) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return activitySortOrder === "desc" ? tb - ta : ta - tb;
    });

  const chatActivityTotalPages = Math.ceil(
    filteredChatActivityLogs.length / ACTIVITY_ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl text-white mb-2">Painel Administrativo</h1>
        <p className="text-muted-foreground">Visão geral do sistema de gerenciamento do VIP Club.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <Card key={index} className="bg-card border-border/40 hover:border-border transition-colors">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {stat.title}
                  </p>
                  <h3 className="text-2xl font-bold text-white">
                    {stat.value}
                  </h3>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.bg} ${stat.isInteractive ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`} onClick={stat.isInteractive ? stat.onClick : undefined}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card border-border/40">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <History className="w-5 h-5 text-amber-500" />
            <span>Histórico de Acesso - Modelos</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 mb-4">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">Período</p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal h-10 px-3 bg-secondary/60 border border-white/10 text-sm min-w-[260px]",
                      !activityDateFilter.start && !activityDateFilter.end && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {activityDateFilter.start || activityDateFilter.end
                      ? `${activityDateFilter.start || "__/__/____"} até ${activityDateFilter.end || "__/__/____"}`
                      : "Selecionar intervalo"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-card border border-border/60" align="start">
                  <Calendar
                    mode="range"
                    captionLayout="dropdown"
                    fromYear={2020}
                    toYear={2035}
                    selected={
                      activityDateFilter.start || activityDateFilter.end
                        ? {
                            from: activityDateFilter.start ? new Date(activityDateFilter.start) : undefined,
                            to: activityDateFilter.end ? new Date(activityDateFilter.end) : undefined,
                          }
                        : undefined
                    }
                    onSelect={(range) => {
                      setActivityDateFilter({
                        start: range?.from ? range.from.toISOString().slice(0, 10) : "",
                        end: range?.to ? range.to.toISOString().slice(0, 10) : "",
                      });
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={async () => {
                setActivityDateFilter({ start: "", end: "" });
                await refetchActivity();
              }}
              className="mt-5 border-border/60 text-red-400 hover:text-red-400 hover:border-red-500/60"
              title="Limpar filtro"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
            </Button>
              <div className="ml-auto flex items-end gap-2">
                {(user?.role === 'admin' || user?.role === 'dev') && (
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/system/activity/reset", {
                          method: "POST",
                          credentials: "include"
                        });
                        if (!res.ok) throw new Error("Falha ao resetar atividades");
                        toast({ title: "Atividades resetadas", description: "As atividades recentes foram limpas com sucesso." });
                        await refetchActivity();
                      } catch (e: any) {
                        toast({ title: "Erro", description: e?.message || "Não foi possível resetar as atividades.", variant: "destructive" });
                      }
                    }}
                    className="mt-5 h-9 px-4 border border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-semibold rounded-md"
                  >
                    Resetar Histórico
                  </Button>
                )}
              </div>
          </div>
          {filteredChatActivityLogs.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
                    <tr>
                      <th className="px-4 py-3">Funcionário</th>
                      <th className="px-4 py-3">Função</th>
                      <th className="px-4 py-3">Mensagem</th>
                      <th 
                        className="px-4 py-3 cursor-pointer select-none"
                        onClick={() => setSortOrder(prev => (prev === "desc" ? "asc" : "desc"))}
                        title="Ordenar por Data/Hora"
                      >
                        <span className="inline-flex items-center">
                          Data/Hora
                          {sortOrder === "desc" ? (
                            <ChevronDown className="w-3 h-3 ml-1" />
                          ) : (
                            <ChevronUp className="w-3 h-3 ml-1" />
                          )}
                        </span>
                      </th>
                    </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredChatActivityLogs
                  .slice(
                    (currentPage - 1) * ITEMS_PER_PAGE,
                    currentPage * ITEMS_PER_PAGE
                  )
                  .map((log: any, idx: number) => {
                      return (
                        <tr key={idx} className="bg-card hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 font-medium text-white">
                            {log.userName || `ID: ${log.userId}`}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={
                              log.role === 'dev' ? "border-red-500 text-red-400" :
                              log.role === 'admin' ? "border-orange-500 text-orange-400" :
                              log.role === 'supervisor' ? "border-purple-500 text-purple-400" :
                              "border-blue-500 text-blue-400"
                            }>
                              {log.role === 'admin' ? "Admin" : 
                               log.role === 'dev' ? "Dev" :
                               log.role === 'supervisor' ? "Supervisor" : 
                               "Chatter"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-white">
                              {log.message}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatLogTimestamp(log.timestamp)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {chatActivityTotalPages > 1 && (
                <div className="flex items-center justify-end space-x-2 py-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    Página {currentPage} de {chatActivityTotalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, chatActivityTotalPages))}
                    disabled={currentPage === chatActivityTotalPages}
                  >
                    Próximo
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma atividade de chat de modelos registrada.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seção de Validação de Sessões (oculta para Admin/Dev, pois a validação foi unificada na tela de Monitoramento) */}
      {activeModels.length > 0 && !(user?.role === 'admin' || user?.role === 'dev' || user?.role === 'supervisor') && (
        <Card className="bg-card border-border/40">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              {user?.role === 'supervisor' ? 'Monitoramento e Chat' : 'Monitoramento e Validação'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
              {activeModels.map((model: Model) => {
                const isValidating = validatingModelId === model.id;
                // @ts-ignore - isValidated property is new
                const isValidated = model.isValidated;

                return (
                  <div 
                    key={model.id} 
                    className="p-4 rounded-lg bg-secondary/30 border border-border/40 transition-all"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {model.avatar ? (
                          <img 
                            src={model.avatar} 
                            alt={model.name} 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Video className="w-5 h-5 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-white font-semibold text-sm truncate">{model.name}</h4>
                          <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${
                            model.chatGroup === "Chat 1" ? "border-cyan-500 text-cyan-400 bg-cyan-500/10" :
                            model.chatGroup === "Chat 2" ? "border-pink-500 text-pink-400 bg-pink-500/10" :
                            "border-gray-500 text-gray-400"
                          }`}>
                            {model.chatGroup || "Sem Chat"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{model.platformEmail}</p>
                      </div>
                      {isValidated && (
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      )}
                    </div>

                    <div className="flex gap-2">
                      {(user?.role === 'admin' || user?.role === 'dev') && (
                        <Button
                          onClick={() => handleOpenBrowserForLogin(model)}
                          disabled={isValidating}
                          className={`flex-1 text-xs h-9 border-0 ${isValidated 
                            ? "bg-green-600 hover:bg-green-700 text-white" 
                            : "bg-primary/90 hover:bg-primary text-white"
                          }`}
                        >
                          {isValidating ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                              Validando
                            </>
                          ) : isValidated ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 mr-2" />
                              Validado
                            </>
                          ) : (
                            <>
                              <Globe className="w-3 h-3 mr-2" />
                              Validar Sessão
                            </>
                          )}
                        </Button>
                      )}

                      {(user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'dev') && (
                        <Button
                          onClick={() => handleOpenMonitor(model)}
                          disabled={!isValidated}
                          className="flex-1 text-xs h-9 bg-secondary hover:bg-secondary/80 text-white border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Eye className="w-3 h-3 mr-2" />
                          Monitoramento
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-8 items-start">
        <Card className="bg-card border-border/40 h-full">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <History className="w-5 h-5 text-amber-500" />
              <span>Histórico de Acesso - Sistema</span>
            </CardTitle>
          </CardHeader>
            <CardContent>
            <div className="flex items-end gap-3 mb-4">
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">Período</p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal h-10 px-3 bg-secondary/60 border border-white/10 text-sm min-w-[260px]",
                        !dateFilter.start && !dateFilter.end && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFilter.start || dateFilter.end
                        ? `${dateFilter.start || "__/__/____"} até ${dateFilter.end || "__/__/____"}`
                        : "Selecionar intervalo"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-card border border-border/60" align="start">
                    <Calendar
                      mode="range"
                      captionLayout="dropdown"
                      fromYear={2020}
                      toYear={2035}
                      selected={
                        dateFilter.start || dateFilter.end
                          ? {
                              from: dateFilter.start ? new Date(dateFilter.start) : undefined,
                              to: dateFilter.end ? new Date(dateFilter.end) : undefined,
                            }
                          : undefined
                      }
                      onSelect={(range) => {
                        setDateFilter({
                          start: range?.from ? range.from.toISOString().slice(0, 10) : "",
                          end: range?.to ? range.to.toISOString().slice(0, 10) : "",
                        });
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={async () => {
                  setDateFilter({ start: "", end: "" });
                  await refetchSystemStats();
                }}
                className="mt-5 border-border/60 text-red-400 hover:text-red-400 hover:border-red-500/60"
                title="Limpar filtro"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </Button>
              <div className="ml-auto flex items-end gap-2">
                {(user?.role === 'admin' || user?.role === 'dev') && (
                  <Button
                    size="sm"
                    onClick={handleResetAccessLogs}
                    className="mt-5 h-9 px-4 border border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-semibold rounded-md"
                  >
                    Resetar Histórico
                  </Button>
                )}
              </div>
            </div>

            {generalActivityLogs && generalActivityLogs.length > 0 && (
              <div className="flex justify-end mb-2 px-2">
                <div 
                  className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer hover:text-white transition-colors select-none"
                  onClick={() => setActivitySortOrder(prev => prev === "desc" ? "asc" : "desc")}
                  title="Ordenar por Data/Hora"
                >
                  Data e hora
                  {activitySortOrder === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {(!generalActivityLogs || generalActivityLogs.length === 0) ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum acesso registrado.
                </div>
              ) : (
                generalActivityLogs
                  .filter((log: any) => {
                    const ts = new Date(log.timestamp).getTime();
                    if (dateFilter.start) {
                      const startTs = new Date(`${dateFilter.start}T00:00:00`).getTime();
                      if (ts < startTs) return false;
                    }
                    if (dateFilter.end) {
                      const endTs = new Date(`${dateFilter.end}T23:59:59`).getTime();
                      if (ts > endTs) return false;
                    }
                    return true;
                  })
                  .slice((activityPage - 1) * ACTIVITY_ITEMS_PER_PAGE, activityPage * ACTIVITY_ITEMS_PER_PAGE)
                  .map((log: any, i: number) => {
                    const borderClass = 'border-white/5 bg-secondary/30 hover:bg-white/5';
                    const message = (log.message || "").toLowerCase();
                    const isLogin = message.includes("logou no sistema");
                    const actionLabel = isLogin ? "entrou no sistema" : "saiu do sistema";

                    return (
                      <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${borderClass}`}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-blue-500/10 text-blue-500">
                          <Activity className="w-4 h-4" />
                        </div>
                        <div className="flex-1 flex justify-between items-center gap-4">
                          <p className="text-sm text-white font-medium">
                            <span className="text-primary font-bold">
                              {log.userName || log.user || "Usuário"}
                            </span>
                            <span>{` ${actionLabel}`}</span>
                          </p>
                          <p className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatLogTimestamp(log.timestamp)}
                          </p>
                        </div>
                      </div>
                    );
                  })
              )}
              
              {/* Sem paginação separada aqui para manter simples */}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
