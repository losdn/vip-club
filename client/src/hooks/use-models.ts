import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
// Importação correta do schema para o build não falhar
import { type InsertModel, type UpdateModelRequest } from "@shared/schema"; 
import { useToast } from "@/hooks/use-toast";

// 1. LISTA GERAL (ADMIN)
export function useModels() {
  return useQuery({
    queryKey: [api.models.list.path],
    queryFn: async () => {
      const res = await fetch(api.models.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Falha ao buscar modelos");
      return await res.json();
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
}

// 2. DASHBOARD (MY MODELS)
export function useMyModels() {
  return useQuery({
    queryKey: ["/api/my-models"],
    queryFn: async () => {
      const res = await fetch("/api/my-models", { 
        credentials: "include",
        cache: "no-store" 
      });
      if (!res.ok) return null;
      return await res.json();
    },
    staleTime: 5000,
  });
}

// 3. CREATE MODEL
export function useCreateModel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertModel) => {
      const res = await fetch(api.models.create.path, {
        method: api.models.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Erro ao criar modelo");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.models.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-models"] });
      toast({ title: "Sucesso", description: "Modelo criado!" });
    },
  });
}

// 4. UPDATE MODEL
export function useUpdateModel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: { id: number } & UpdateModelRequest) => {
      const { id, ...data } = payload;
      const url = buildUrl(api.models.update.path, { id });

      const res = await fetch(url, {
        method: api.models.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        let error;
        try {
          error = await res.json();
        } catch (e) {
          // Fallback if response is not JSON (e.g. 500 HTML page)
          const text = await res.text();
          console.error("Non-JSON error response:", text);
          throw new Error(`Erro no servidor (${res.status}): ${text.slice(0, 100)}`);
        }

        // Propagate details if available
        const details = error.details ? `: ${JSON.stringify(error.details)}` : "";
        throw new Error((error.message || "Erro ao atualizar") + details);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.models.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-models"] });
      toast({ title: "Sucesso", description: "Modelo atualizado!" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro", 
        description: error.message,
        variant: "destructive"
      });
    },
  });
}

// 5. DELETE MODEL (Adicionado para corrigir o erro do build)
export function useDeleteModel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.models.delete.path, { id });
      const res = await fetch(url, {
        method: api.models.delete.method,
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Falha ao excluir modelo");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.models.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-models"] });
      toast({ title: "Removido", description: "Modelo excluído com sucesso." });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });
}

// 6. START AUTOMATION
export function useStartAutomation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (modelId: number) => {
      const res = await fetch(api.automation.start.path, {
        method: api.automation.start.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Erro ao iniciar automação");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-models"] });
      toast({ title: "Iniciando...", description: "O navegador está abrindo." });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro na Conexão", 
        description: error.message,
        variant: "destructive"
      });
    },
  });
}
