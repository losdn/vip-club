import { useEffect } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Shell } from "@/components/layout/Shell";
import { Loader2 } from "lucide-react";
import { SupportNotifications } from "@/components/layout/SupportNotifications";

import Login from "@/pages/Login";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import Users from "@/pages/admin/Users";
import Models from "@/pages/admin/Models";
import Permissions from "@/pages/admin/Permissions";
import MonitorSessions from "@/pages/admin/MonitorSessions";
import ChatterDashboard from "@/pages/chatter/Dashboard";
import NotFound from "@/pages/not-found";
import ChatView from "@/pages/chatter/chat-view";
import Support from "@/pages/Support";
import Security from "@/pages/admin/Security";
import DeviceBlocked from "@/pages/DeviceBlocked";

function Router() {
  const { user, isLoading } = useAuth();

  // Heartbeat para manter status online
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      fetch("/api/heartbeat", { method: "POST" }).catch(console.error);
    }, 30000); // 30 segundos

    return () => clearInterval(interval);
  }, [user]);

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex-1 overflow-hidden relative">
        <Switch>
          {/* Admin Routes */}
      <Route path="/admin/monitor">
        {user?.role === 'admin' || user?.role === 'dev' || user?.role === 'supervisor' ? <Shell><MonitorSessions /></Shell> : <Redirect to="/" />}
      </Route>
      <Route path="/admin">
        {user?.role === 'admin' || user?.role === 'dev' || user?.role === 'supervisor' ? <Shell><AdminDashboard /></Shell> : <Redirect to="/" />}
      </Route>
      
      <Route path="/admin/users">
        {user?.role === 'admin' || user?.role === 'dev' ? <Shell><Users /></Shell> : <Redirect to="/" />}
      </Route>

      <Route path="/admin/models">
        {user?.role === 'admin' || user?.role === 'dev' ? <Shell><Models /></Shell> : <Redirect to="/" />}
      </Route>

      <Route path="/admin/permissions">
        {user?.role === 'admin' || user?.role === 'dev' ? <Shell><Permissions /></Shell> : <Redirect to="/" />}
      </Route>

      <Route path="/admin/security">
        {user?.role === 'admin' || user?.role === 'dev' ? <Shell><Security /></Shell> : <Redirect to="/" />}
      </Route>

      {/* Chatter Routes */}
      <Route path="/dashboard">
        {user ? <Shell><ChatterDashboard /></Shell> : <Redirect to="/" />}
      </Route>

      {/* Compat route: qualquer acesso antigo a /chats vai para o dashboard */}
      <Route path="/chats">
        {user ? <Redirect to="/dashboard" /> : <Redirect to="/" />}
      </Route>

      <Route path="/chat/:id">
        {user ? <Shell noPadding={true}><ChatView /></Shell> : <Redirect to="/" />}
      </Route>

      {/* Support Route (All users) */}
      <Route path="/support">
        {user ? <Shell><Support /></Shell> : <Redirect to="/" />}
      </Route>

      <Route path="/device-blocked">
        <DeviceBlocked />
      </Route>

      {/* Root/Login Route - Must be AFTER all other routes */}
      <Route path="/">
        {user ? (
          <Redirect to={(user.role === 'admin' || user.role === 'dev' || user.role === 'supervisor') ? "/admin" : "/dashboard"} />
        ) : (
          <Login />
        )}
      </Route>

      {/* 404 Catch-all - Must be LAST */}
      <Route>
        <NotFound />
      </Route>
    </Switch>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <SupportNotifications />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
