import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Users, 
  Video, 
  Shield, 
  Lock, 
  LifeBuoy, 
  LogOut, 
  MonitorPlay,
  MessageSquare,
  Gem
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export function Sidebar() {
  const { user, logout, isLoggingOut } = useAuth();
  const [location] = useLocation();

  if (!user) return null;

  const isAdmin = user.role === 'admin' || user.role === 'dev';
  const isSupervisor = user.role === 'supervisor';
  const isChatter = !isAdmin && !isSupervisor; 

  const sections = [];

  // Admin / Supervisor Sections
  if (isAdmin || isSupervisor) {
    sections.push({
      title: "GERENCIAMENTO",
      items: [
        { href: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
        { href: '/admin/monitor', icon: MonitorPlay, label: 'Monitoramento' }
      ]
    });
  }

  if (isAdmin) {
    sections.push({
      title: "ADMINISTRAÇÃO",
      items: [
        { href: '/admin/users', icon: Users, label: 'Usuários' },
        { href: '/admin/models', icon: Video, label: 'Modelos' },
        { href: '/admin/permissions', icon: Shield, label: 'Permissões' },
        { href: '/admin/security', icon: Lock, label: 'Segurança' }
      ]
    });
  }

  // Chatter Section
  if (isChatter) {
    sections.push({
      title: "CHAT",
      items: [
        { href: '/dashboard', icon: MessageSquare, label: 'Modelos' }
      ]
    });
  }

  // Common Section
  sections.push({
    title: "SUPORTE",
    items: [
      { href: '/support', icon: LifeBuoy, label: 'Suporte' }
    ]
  });

  return (
    <div className="w-64 h-full bg-[#0f0a15] border-r border-white/5 flex flex-col flex-none shadow-2xl">
      {/* Header / Logo */}
      <div className="h-24 flex flex-col justify-center px-6 border-b border-white/5">
        <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 shadow-lg shadow-primary/20 hover:scale-105 transition-transform duration-300 flex items-center justify-center bg-primary/10 rounded-lg">
              <Gem className="w-6 h-6 text-primary" fill="currentColor" fillOpacity={0.2} />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight text-white leading-none">VIP Club</h1>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-1">Management System</p>
            </div>
        </div>
      </div>

      <ScrollArea className="flex-1 py-6">
        <nav className="space-y-6 px-4">
          {sections.map((section, idx) => (
            <div key={idx} className="space-y-2">
              {section.title && (
                <h3 className="text-[11px] font-bold text-muted-foreground/50 uppercase tracking-wider px-3 mb-2">
                  {section.title}
                </h3>
              )}
              
              <div className="space-y-1">
                {section.items.map((link) => {
                  const Icon = link.icon;
                  const isActive = location === link.href || (link.href !== '/admin' && location.startsWith(link.href));
                  
                  return (
                    <Link key={link.href} href={link.href}>
                      <div className={cn(
                        "flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-xl transition-all duration-300 cursor-pointer group",
                        isActive 
                          ? "bg-gradient-to-r from-primary to-violet-600 text-white shadow-lg shadow-primary/25 translate-x-1" 
                          : "text-muted-foreground hover:text-white hover:bg-white/5"
                      )}>
                        <Icon className={cn("w-5 h-5 transition-transform duration-300", isActive ? "scale-110" : "group-hover:scale-110")} />
                        {link.label}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* User Profile Footer */}
      <div className="p-4 mt-auto border-t border-white/5 bg-black/20">
        <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-violet-500 p-[2px]">
              <Avatar className="w-full h-full border-2 border-[#0f0a15]">
                <AvatarImage src={user.avatar} className="object-cover" />
                <AvatarFallback className="bg-[#0f0a15] text-white font-bold">
                  {user.username.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="flex-1 overflow-hidden">
                <p className="text-sm font-bold text-white truncate">{user.name}</p>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
                </div>
            </div>
        </div>
        
        <Button 
            variant="ghost" 
            className="w-full justify-start gap-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors rounded-xl h-10"
            onClick={() => logout()}
            disabled={isLoggingOut}
        >
            <LogOut className="w-4 h-4" />
            Sair do Sistema
        </Button>
      </div>
    </div>
  );
}
