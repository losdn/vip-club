import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DeviceBlocked() {
  const [deviceId, setDeviceId] = useState<string>("Carregando...");

  useEffect(() => {
    // @ts-ignore
    if (window.electronAPI) {
      // @ts-ignore
      window.electronAPI.getDeviceId()
        .then((id: string) => setDeviceId(id))
        .catch(() => setDeviceId("Erro ao obter ID"));
    } else {
      setDeviceId("N/A (Navegador Web)");
    }
  }, []);

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[#1a1625] p-4">
      <Card className="max-w-md w-full border-red-500/20 bg-[#110b1d]">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
            <ShieldAlert className="w-8 h-8 text-red-500" />
          </div>
          <CardTitle className="text-2xl text-white">Dispositivo Bloqueado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-gray-400">
            Este dispositivo não está autorizado a acessar o sistema.
            Entre em contato com o administrador se acredita que isso é um erro.
          </p>
          <div className="text-xs text-gray-500 bg-black/20 p-2 rounded border border-white/5 font-mono">
             Device ID: {deviceId}
          </div>
          <Button 
            className="w-full bg-white/5 hover:bg-white/10 text-white border-white/10"
            onClick={() => window.location.href = '/'}
          >
            Tentar Novamente
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
