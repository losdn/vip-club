import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useState } from "react";

export default function TestFacebook() {
  const [loading, setLoading] = useState(true);

  return (
    <div className="space-y-6 h-[calc(100vh-theme(spacing.32))]">
      <header>
        <h1 className="text-3xl font-bold text-white mb-2">Teste de Iframe - Facebook</h1>
        <p className="text-muted-foreground font-medium">
          Esta página testa login e scraping do Facebook com credenciais reais.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          O sistema fará login automaticamente e mostrará a página do Facebook logada no iframe.
        </p>
      </header>

      <Card className="flex-1 min-h-[600px] border-primary/20 bg-black/40 overflow-hidden relative flex flex-col">
        <div 
          className="absolute inset-0 flex items-center justify-center bg-black/50 z-10" 
          id="facebook-loading"
          style={{ display: loading ? 'flex' : 'none' }}
        >
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
            <p className="text-muted-foreground">Fazendo login no Facebook...</p>
            <p className="text-xs text-muted-foreground mt-2">Isso pode levar alguns segundos</p>
          </div>
        </div>
        <iframe
          src="/api/test-facebook"
          className="w-full h-full border-0"
          title="Test Facebook Iframe"
          style={{ minHeight: '600px', width: '100%', height: '100%' }}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-top-navigation"
          allow="fullscreen"
          onLoad={(e) => {
            console.log("[TestFacebook] ===== IFRAME LOADED ======");
            const iframe = e.target as HTMLIFrameElement;
            console.log("[TestFacebook] Iframe src:", iframe.src);
            console.log("[TestFacebook] Iframe loaded at:", new Date().toISOString());
            
            setTimeout(() => {
              const loadingEl = document.getElementById('facebook-loading');
              if (loadingEl) {
                loadingEl.style.display = 'none';
                console.log("[TestFacebook] Loading indicator hidden");
              }
              setLoading(false);
            }, 1000);
            
            try {
              const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (iframeDoc) {
                console.log("[TestFacebook] Iframe document accessible!");
                console.log("[TestFacebook] Iframe title:", iframeDoc.title);
                console.log("[TestFacebook] Iframe body content length:", iframeDoc.body?.innerHTML?.length || 0);
              } else {
                console.log("[TestFacebook] Iframe document not accessible (CORS restriction - this is normal)");
              }
            } catch (err) {
              console.log("[TestFacebook] Cannot access iframe content (CORS - expected):", err);
            }
          }}
          onError={(e) => {
            console.error("[TestFacebook] ===== IFRAME ERROR ======");
            console.error("[TestFacebook] Iframe load error:", e);
            const loadingEl = document.getElementById('facebook-loading');
            if (loadingEl) {
              loadingEl.innerHTML = `
                <div class="text-center">
                  <p class="text-red-400 mb-2">Erro ao carregar Facebook</p>
                  <p class="text-xs text-muted-foreground">Verifique o console e os logs do servidor</p>
                  <p class="text-xs text-muted-foreground">Rota: /api/test-facebook</p>
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
