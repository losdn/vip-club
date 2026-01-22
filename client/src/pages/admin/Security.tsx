import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ShieldAlert, ShieldCheck, Search, Loader2, Ban, Trash2, MapPin, ChevronLeft, ChevronRight, Monitor, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function Security() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [blockIpAddress, setBlockIpAddress] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 11;

  // Fetch Logs
  const { data: logs, isLoading: isLoadingLogs } = useQuery({
    queryKey: ["/api/admin/connection-logs"],
    queryFn: async () => {
       const res = await fetch("/api/admin/connection-logs?limit=200");
       if (!res.ok) throw new Error("Failed to fetch logs");
       return res.json();
    }
  });

  // Fetch Blocked IPs
  const { data: blockedIps, isLoading: isLoadingBlocked } = useQuery({
    queryKey: ["/api/admin/blocked-ips"],
    queryFn: async () => {
       const res = await fetch("/api/admin/blocked-ips");
       if (!res.ok) throw new Error("Failed to fetch blocked IPs");
       return res.json();
    }
  });

  // Fetch Devices
  const { data: devices, isLoading: isLoadingDevices } = useQuery({
    queryKey: ["/api/admin/devices"],
    queryFn: async () => {
       const res = await fetch("/api/admin/devices");
       if (!res.ok) throw new Error("Failed to fetch devices");
       return res.json();
    }
  });

  // Block IP Mutation
  const blockMutation = useMutation({
    mutationFn: async (data: { ip: string, reason: string }) => {
      const res = await fetch("/api/admin/blocked-ips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to block IP");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blocked-ips"] });
      toast({ title: "IP Bloqueado", description: "O IP foi adicionado à lista negra com sucesso." });
      setIsBlockDialogOpen(false);
      setBlockIpAddress("");
      setBlockReason("");
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  });

  // Unblock IP Mutation
  const unblockMutation = useMutation({
    mutationFn: async (ip: string) => {
      const res = await fetch(`/api/admin/blocked-ips/${encodeURIComponent(ip)}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to unblock IP");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blocked-ips"] });
      toast({ title: "IP Desbloqueado", description: "O acesso foi restaurado para este IP." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível desbloquear o IP.", variant: "destructive" });
    }
  });

  // Block Device Mutation
  const blockDeviceMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      const res = await fetch(`/api/admin/devices/${deviceId}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Bloqueio manual via Histórico" })
      });
      if (!res.ok) throw new Error("Falha ao bloquear dispositivo");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/connection-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/devices"] });
      toast({ title: "Dispositivo Bloqueado", description: "O dispositivo foi bloqueado com sucesso." });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  });

  // Unblock Device Mutation
  const unblockDeviceMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      const res = await fetch(`/api/admin/devices/${deviceId}/unblock`, {
        method: "POST"
      });
      if (!res.ok) throw new Error("Falha ao desbloquear dispositivo");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/devices"] });
      toast({ title: "Dispositivo Desbloqueado", description: "O acesso foi restaurado para este dispositivo." });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  });

  const handleBlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockIpAddress) return;
    blockMutation.mutate({ ip: blockIpAddress, reason: blockReason });
  };

  const filteredLogs = logs?.filter((log: any) => 
    log.ip.includes(searchTerm) || 
    (log.username && log.username.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalPages = filteredLogs ? Math.ceil(filteredLogs.length / itemsPerPage) : 0;
  const paginatedLogs = filteredLogs?.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const filteredBlocked = blockedIps?.filter((item: any) => 
    item.ip.includes(searchTerm)
  );

  const blockedDevices = devices?.filter((d: any) => d.status === 'blocked' && (
    d.deviceId.includes(searchTerm) || 
    (d.username && d.username.toLowerCase().includes(searchTerm.toLowerCase()))
  ));

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl text-white mb-2 flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-primary" />
            Segurança e IPs
          </h1>
          <p className="text-muted-foreground">Monitore acessos e gerencie bloqueios de IP.</p>
        </div>
        
        <Dialog open={isBlockDialogOpen} onOpenChange={setIsBlockDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="bg-destructive/10 border-destructive text-destructive hover:bg-destructive/20">
              <Ban className="w-4 h-4 mr-2" />
              Bloquear IP Manualmente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bloquear IP</DialogTitle>
              <DialogDescription>
                Impeça o acesso de um endereço IP específico ao sistema.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleBlockSubmit} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="ip">Endereço IP</Label>
                <Input 
                  id="ip" 
                  placeholder="Ex: 192.168.1.1" 
                  value={blockIpAddress}
                  onChange={(e) => setBlockIpAddress(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Motivo (Opcional)</Label>
                <Input 
                  id="reason" 
                  placeholder="Ex: Tentativas suspeitas de login" 
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsBlockDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="destructive" disabled={blockMutation.isPending}>
                  {blockMutation.isPending ? "Bloqueando..." : "Bloquear Acesso"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card rounded-xl border border-border/40 overflow-hidden shadow-lg p-6">
        <Tabs defaultValue="logs" className="w-full">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="logs">Histórico de Acessos</TabsTrigger>
              <TabsTrigger value="blocked">IPs Bloqueados</TabsTrigger>
              <TabsTrigger value="blocked-devices">Dispositivos Bloqueados</TabsTrigger>
            </TabsList>
            
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input 
                placeholder="Buscar IP ou Usuário..." 
                className="pl-10 bg-secondary/50 border-border/50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <TabsContent value="logs" className="mt-0">
            {isLoadingLogs ? (
              <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="rounded-md border border-border/40">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/[0.02] hover:bg-transparent">
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>Device ID</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Local</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Nenhum registro encontrado.
                        </TableCell>
                      </TableRow>
                    )}
                    {paginatedLogs?.map((log: any) => (
                      <TableRow key={log.id} className="border-white/[0.02]">
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-white/90">
                              {format(new Date(log.timestamp), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                            <span className="opacity-70">
                              {format(new Date(log.timestamp), "HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">
                          {log.ip === '::1' ? '127.0.0.1' : log.ip}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {log.deviceId ? (
                             <div className="flex items-center gap-1" title={log.deviceId}>
                               <Smartphone className="w-3 h-3" />
                               {log.deviceId.substring(0, 8)}...
                             </div>
                          ) : (
                             <span className="opacity-50">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {log.username ? (
                            <span className="font-medium text-primary">{log.username}</span>
                          ) : (
                            <span className="text-muted-foreground italic">Anônimo</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs">
                            <MapPin className="w-3 h-3" />
                            {(log.location === 'Unknown Location' && (log.ip === '::1' || log.ip === '127.0.0.1')) 
                              ? 'Servidor Local' 
                              : (log.location || "Desconhecido")}
                          </div>
                        </TableCell>
                        <TableCell>
                          {log.blocked ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                              Bloqueado
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500">
                              Permitido
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {log.deviceId && (
                                <Button 
                                variant="ghost" 
                                size="sm"
                                className={cn(
                                    "hover:bg-opacity-10",
                                    devices?.find((d: any) => d.deviceId === log.deviceId)?.status === 'blocked' 
                                      ? "text-red-500 hover:bg-red-500" 
                                      : "text-orange-500 hover:bg-orange-500 hover:text-orange-600"
                                )}
                                onClick={() => {
                                    const isBlocked = devices?.find((d: any) => d.deviceId === log.deviceId)?.status === 'blocked';
                                    if (isBlocked) {
                                        if(confirm('Deseja desbloquear este dispositivo?')) {
                                            unblockDeviceMutation.mutate(log.deviceId);
                                        }
                                    } else {
                                        if(confirm('Tem certeza que deseja bloquear este dispositivo? Isso impedirá o acesso de qualquer conta através dele.')) {
                                            blockDeviceMutation.mutate(log.deviceId);
                                        }
                                    }
                                }}
                                title={devices?.find((d: any) => d.deviceId === log.deviceId)?.status === 'blocked' ? "Dispositivo Bloqueado (Clique para desbloquear)" : "Bloquear Dispositivo"}
                                >
                                {devices?.find((d: any) => d.deviceId === log.deviceId)?.status === 'blocked' ? (
                                    <Ban className="w-4 h-4" />
                                ) : (
                                    <Smartphone className="w-4 h-4" />
                                )}
                                </Button>
                            )}
                            <Button 
                                variant="ghost" 
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                setBlockIpAddress(log.ip);
                                setIsBlockDialogOpen(true);
                                }}
                                title="Bloquear IP"
                            >
                                <Ban className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-end space-x-2 py-4 px-4 border-t border-white/[0.02]">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="bg-transparent border-white/10 text-white/70 hover:text-white hover:bg-white/5"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Página {currentPage} de {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="bg-transparent border-white/10 text-white/70 hover:text-white hover:bg-white/5"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>



          <TabsContent value="blocked" className="mt-0">
            {isLoadingBlocked ? (
              <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="rounded-md border border-border/40">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/[0.02] hover:bg-transparent">
                      <TableHead>IP</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Data do Bloqueio</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBlocked?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          Nenhum IP bloqueado.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredBlocked?.map((item: any) => (
                      <TableRow key={item.id} className="border-white/[0.02]">
                        <TableCell className="font-mono font-medium">{item.ip}</TableCell>
                        <TableCell>{item.reason || "Sem motivo especificado"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(item.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => unblockMutation.mutate(item.ip)}
                            disabled={unblockMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Desbloquear
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="blocked-devices" className="mt-0">
            {isLoadingDevices ? (
              <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="rounded-md border border-border/40">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/[0.02] hover:bg-transparent">
                      <TableHead>Device ID</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Última Atividade</TableHead>
                      <TableHead>Último IP</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedDevices?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhum dispositivo bloqueado.
                        </TableCell>
                      </TableRow>
                    )}
                    {blockedDevices?.map((device: any) => (
                      <TableRow key={device.deviceId} className="border-white/[0.02]">
                        <TableCell className="font-mono font-medium text-xs">
                          <div className="flex items-center gap-2">
                             <Monitor className="w-4 h-4 text-muted-foreground" />
                             {device.deviceId}
                          </div>
                        </TableCell>
                        <TableCell>
                          {device.username ? (
                            <span className="font-medium text-primary">{device.username}</span>
                          ) : (
                            <span className="text-muted-foreground italic">Desconhecido</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                            Bloqueado
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {device.lastActiveAt ? format(new Date(device.lastActiveAt), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '-'}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {device.lastIp || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              if(confirm('Tem certeza que deseja desbloquear este dispositivo?')) {
                                unblockDeviceMutation.mutate(device.deviceId);
                              }
                            }}
                            className="text-green-500 hover:text-green-600 border-green-500/20 hover:bg-green-500/10"
                            disabled={unblockDeviceMutation.isPending}
                          >
                            <ShieldCheck className="w-4 h-4 mr-2" />
                            Desbloquear
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
