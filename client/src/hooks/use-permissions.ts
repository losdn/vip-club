import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
// CORREÇÃO: Importando o tipo do lugar correto
import { type InsertPermission } from "@shared/schema"; 
import { useToast } from "@/hooks/use-toast";

// 1. LISTA DE PERMISSÕES (ADMIN)
export function usePermissions() {
  return useQuery({
    queryKey: [api.permissions.list.path],
    queryFn: async () => {
      const res = await fetch(api.permissions.list.path, { 
        credentials: "include" 
      });
      
      if (!res.ok) {
        throw new Error("Falha ao buscar permissões");
      }
      
      return await res.json();
    },
  });
}

// 2. ATRIBUIR PERMISSÃO (VINCULAR CHATTER À MODELO)
export function useAssignPermission() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertPermission) => {
      // Simplificado: Enviamos os dados diretamente sem o .parse() que trava o build
      const res = await fetch(api.permissions.assign.path, {
        method: api.permissions.assign.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Falha ao atribuir permissão");
      }
      
      return await res.json();
    },
    onSuccess: () => {
      // Invalida os caches para a lista atualizar na hora
      queryClient.invalidateQueries({ queryKey: [api.permissions.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-models"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-permissions"] });
      toast({ 
        title: "Permissão Atribuída", 
        description: "O Chatter agora tem acesso a esta modelo." 
      });
    },
    onError: (err: Error) => {
      toast({ 
        title: "Erro", 
        description: err.message, 
        variant: "destructive" 
      });
    },
  });
}

// 3. REVOGAR PERMISSÃO (REMOVER ACESSO)
export function useRevokePermission() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.permissions.revoke.path, { id });
      const res = await fetch(url, { 
        method: api.permissions.revoke.method, 
        credentials: "include" 
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Falha ao revogar permissão");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.permissions.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-models"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-permissions"] });
      toast({ 
        title: "Permissão Revogada", 
        description: "Acesso removido com sucesso." 
      });
    },
    onError: (err: Error) => {
      toast({ 
        title: "Erro", 
        description: err.message, 
        variant: "destructive" 
      });
    },
  });
}
