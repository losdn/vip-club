import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function TestIframe() {
  const [loading, setLoading] = useState(true);
  const [location] = useLocation();
  
  // Obtém o parâmetro 'site' da URL
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const siteParam = urlParams.get('site') || 'simple';

  return (
    <div className="space-y-6 h-[calc(100vh-theme(spacing.32))]">
      <header>
        <h1 className="text-3xl font-bold text-white mb-2">Teste de Iframe</h1>
        <p className="text-muted-foreground font-medium">
          Esta página testa se o sistema de scraping e iframe está funcionando corretamente.
        </p>
        <div className="flex gap-2 mt-4 flex-wrap">
          <a href="/test-iframe?site=simple" className="px-3 py-1 bg-primary/20 hover:bg-primary/30 rounded text-sm text-white border border-primary/50">
            HTML Simples
          </a>
          <a href="/test-iframe?site=test-simple" className="px-3 py-1 bg-green-500/20 hover:bg-green-500/30 rounded text-sm text-white border border-green-500/50">
            Teste Simples (Novo)
          </a>
          <a href="/test-iframe?site=vite-bypass" className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded text-sm text-white border border-red-500/50">
            Teste Vite Bypass
          </a>
          <a href="/test-iframe?site=wikipedia" className="px-3 py-1 bg-primary/20 hover:bg-primary/30 rounded text-sm text-white border border-primary/50">
            Wikipedia
          </a>
          <a href="/test-iframe?site=github" className="px-3 py-1 bg-primary/20 hover:bg-primary/30 rounded text-sm text-white border border-primary/50">
            GitHub
          </a>
          <a href="/test-iframe?site=stackoverflow" className="px-3 py-1 bg-primary/20 hover:bg-primary/30 rounded text-sm text-white border border-primary/50">
            Stack Overflow
          </a>
          <a href="/test-iframe?site=httpbin" className="px-3 py-1 bg-primary/20 hover:bg-primary/30 rounded text-sm text-white border border-primary/50">
            HTTPBin
          </a>
          <a href="/test-iframe?site=facebook" className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 rounded text-sm text-white border border-blue-500/50">
            Facebook (Login)
          </a>
          <a href="/test-iframe?site=direct-example" className="px-3 py-1 bg-green-500/20 hover:bg-green-500/30 rounded text-sm text-white border border-green-500/50">
            Teste Direto (Example.com)
          </a>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Clique nos botões acima para testar diferentes sites. Se aparecer conteúdo, o sistema está funcionando.
        </p>
      </header>

      <Card className="flex-1 min-h-[600px] border-primary/20 bg-black/40 overflow-hidden relative flex flex-col">
        <div 
          className="absolute inset-0 flex items-center justify-center bg-black/50 z-10" 
          id="test-loading"
          style={{ display: loading ? 'flex' : 'none' }}
        >
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
            <p className="text-muted-foreground">Carregando teste de iframe...</p>
          </div>
        </div>
        <iframe
          key={`test-iframe-${siteParam}`}
          src={
            siteParam === 'facebook' 
              ? '/api/test-facebook' 
              : siteParam === 'direct-example' 
                ? '/api/test-direct?site=example'
              : siteParam === 'test-simple'
                ? '/api/test-simple'
              : siteParam === 'vite-bypass'
                ? '/api/test-vite-bypass'
                : `/api/test-iframe?site=${siteParam}`
          }
          className="w-full h-full border-0"
          title={`Test Iframe - ${siteParam}`}
          style={{ minHeight: '600px', width: '100%', height: '100%' }}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
          allow="fullscreen"
          onLoad={(e) => {
            console.log("[TestIframe] ===== IFRAME LOADED ======");
            const iframe = e.target as HTMLIFrameElement;
            console.log("[TestIframe] Iframe src:", iframe.src);
            console.log("[TestIframe] Iframe loaded at:", new Date().toISOString());
            
            setTimeout(() => {
              const loadingEl = document.getElementById('test-loading');
              if (loadingEl) {
                loadingEl.style.display = 'none';
                console.log("[TestIframe] Loading indicator hidden");
              }
              setLoading(false);
            }, 500);
            
            try {
              const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (iframeDoc) {
                console.log("[TestIframe] Iframe document accessible!");
                console.log("[TestIframe] Iframe title:", iframeDoc.title);
                console.log("[TestIframe] Iframe body content length:", iframeDoc.body?.innerHTML?.length || 0);
              } else {
                console.log("[TestIframe] Iframe document not accessible (CORS restriction - this is normal)");
              }
            } catch (err) {
              console.log("[TestIframe] Cannot access iframe content (CORS - expected):", err);
            }
          }}
          onError={(e) => {
            console.error("[TestIframe] ===== IFRAME ERROR ======");
            console.error("[TestIframe] Iframe load error:", e);
            const loadingEl = document.getElementById('test-loading');
            if (loadingEl) {
              loadingEl.innerHTML = `
                <div class="text-center">
                  <p class="text-red-400 mb-2">Erro ao carregar teste de iframe</p>
                  <p class="text-xs text-muted-foreground">Verifique o console e os logs do servidor</p>
                  <p class="text-xs text-muted-foreground">Rota: /api/test-iframe</p>
                  <button onclick="window.location.reload()" class="mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary/90">
                    Tentar Novamente
                  </button>
                </div>
              `;
            }
            setLoading(false);
          }}
        />
      </Card>
    </div>
  );
}
