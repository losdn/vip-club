import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

export function useAuth() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast, dismiss } = useToast();

  // 1. QUERY DE USUÁRIO (ME)
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/user"], // Chave simplificada para evitar erros de undefined
    queryFn: async () => {
      try {
        const res = await fetch("/api/user", { 
          credentials: "include",
          cache: "no-store",
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (res.status === 401) return null;
        if (!res.ok) throw new Error("Falha na sessão");
        
        return await res.json();
      } catch (err) {
        console.error("[useAuth] Erro ao buscar usuário:", err);
        return null;
      }
    },
    staleTime: 60000, // Considera os dados "frescos" por 1 minuto
    retry: false, // Não tenta de novo se der 401
  });

  // 2. REDIRECIONAMENTO (movido para depois do logoutMutation)
  
  // 3. LOGIN MUTATION
  const loginMutation = useMutation({
    mutationFn: async (credentials: any) => {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Usuário ou senha inválidos");
      }

      return await res.json();
    },
    onSuccess: (userData) => {
      queryClient.setQueryData(["/api/user"], userData);
      toast({ title: "Sucesso", description: `Bem-vindo, ${userData.name}` });
      if (userData.role === 'admin' || userData.role === 'dev' || userData.role === 'supervisor') {
        setLocation("/admin");
      } else {
        setLocation("/dashboard");
      }
    },
    onError: (err: Error) => {
      toast({ title: "Erro no Login", description: err.message, variant: "destructive" });
    }
  });

  // 4. LOGOUT MUTATION
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/logout", { 
        method: "POST", 
        credentials: "include" 
      });
      if (!res.ok) throw new Error("Erro ao sair");
    },
    onSuccess: () => {
      dismiss();
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear();
      localStorage.removeItem('validated-models');
      setLocation("/");
    },
    onError: (err: Error) => {
      dismiss();
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear();
      localStorage.removeItem('validated-models');
      setLocation("/");
    }
  });

  // 2. REDIRECIONAMENTO CORRIGIDO
  useEffect(() => {
    if (!isLoading && user === null && !logoutMutation.isPending) {
      const path = window.location.pathname;
      if (path !== "/" && path !== "/auth") {
        dismiss();
        setLocation("/");
      }
    }
  }, [user, isLoading, setLocation, logoutMutation.isPending, dismiss]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const ping = async () => {
      try {
        await fetch("/api/heartbeat", {
          method: "POST",
          credentials: "include",
        });
      } catch {
      }
    };

    ping();
    const id = setInterval(() => {
      if (!cancelled) ping();
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user?.id]);

  return {
    user,
    isLoading,
    error,
    login: loginMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
