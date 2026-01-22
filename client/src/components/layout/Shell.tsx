import { ReactNode, useEffect } from "react";

import { Sidebar } from "./Sidebar";

import { useAuth } from "@/hooks/use-auth";

import { Loader2 } from "lucide-react";

import { useLocation, Redirect } from "wouter";



export function Shell({ children, noPadding = false }: { children: ReactNode; noPadding?: boolean }) {

  const { user, isLoading } = useAuth();

  const [location, setLocation] = useLocation();



  // CRÍTICO: Redireciona automaticamente para login APENAS quando realmente deslogado

  // Não redireciona durante F5/refresh se a sessão ainda é válida

  // O logout só acontece após muito tempo inativo (sessão expirada no servidor)

  useEffect(() => {

    // Só redireciona se:

    // 1. Não está carregando (isLoading === false) - aguarda carregamento completo

    // 2. Usuário é explicitamente null (sessão expirada, não durante loading)

    // 3. Não está na página de login

    // 4. Não há erro de rede (erro pode ser temporário)

    if (!isLoading && user === null && location !== "/") {

      // Sessão expirada após inatividade - redireciona para login

      console.log(`[Shell] Session expired (user inactive), redirecting from ${location} to /`);

      setLocation("/");

    }

  }, [user, isLoading, location, setLocation]);



  // CRÍTICO: Durante loading, mostra loading screen (não redireciona)

  if (isLoading) {

    return (

      <div className="h-screen w-full bg-background flex items-center justify-center">

        <Loader2 className="w-8 h-8 animate-spin text-primary" />

      </div>

    );

  }



  // If we are on login page, don't show shell

  if (location === "/") {

    return <>{children}</>;

  }



  // CRÍTICO: Só redireciona se user for explicitamente null (não undefined)

  // Durante F5, o React Query mantém o cache, então user não será null se a sessão estiver válida

  if (user === null) {

    return <Redirect to="/" />;

  }



  return (
    <div className="h-full bg-background text-foreground flex overflow-hidden">
      <Sidebar />
      <main className={`flex-1 max-w-full ${noPadding ? "p-0 overflow-hidden flex flex-col" : "p-8 overflow-y-auto"}`}>
        {noPadding ? (
          children
        ) : (
          <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        )}
      </main>

    </div>

  );

}