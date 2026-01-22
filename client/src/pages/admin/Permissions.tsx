import { useState, useMemo } from "react";
import { usePermissions, useAssignPermission, useRevokePermission } from "@/hooks/use-permissions";
import { useUsers } from "@/hooks/use-users";
import { useModels } from "@/hooks/use-models";
import { Button } from "@/components/ui/button";
import type { Model } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";

export default function Permissions() {
  const { data: permissions, isLoading: loadingPermissions } = usePermissions();
  const { data: users, isLoading: loadingUsers } = useUsers();
  const { data: models, isLoading: loadingModels } = useModels();
  
  const { mutate: assign, isPending: isAssigning } = useAssignPermission();
  const { mutate: revoke, isPending: isRevoking } = useRevokePermission();

  const [selectedChatter, setSelectedChatter] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");

  const chatters = users?.filter(u => u.role === "chatter") || [];
  const activeModels = models?.filter((m: Model) => m.status === "active") || [];

  const enrichedPermissions = useMemo(() => {
    if (!permissions) return [];
    if (!users || users.length === 0) return permissions;

    return permissions.map((perm: any) => {
      const existingAvatar = perm?.chatter?.avatar;
      if (existingAvatar) return perm;

      const user = users.find(u => u.id === perm.chatterId);
      if (!user?.avatar) return perm;

      return {
        ...perm,
        chatter: {
          ...(perm.chatter || {}),
          id: perm.chatter?.id ?? perm.chatterId,
          name: perm.chatter?.name ?? user.name,
          avatar: user.avatar
        }
      };
    });
  }, [permissions, users]);

  const handleAssign = () => {
    if (!selectedChatter || !selectedModel) return;
    
    assign({
      chatterId: parseInt(selectedChatter),
      modelId: parseInt(selectedModel)
    }, {
      onSuccess: () => {
        setSelectedModel("");
      }
    });
  };

  const isLoading = loadingPermissions || loadingUsers || loadingModels;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl text-white mb-2">Controle de Acesso</h1>
        <p className="text-muted-foreground">Gerencie quais chatters podem acessar quais modelos.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 h-fit">
          <Card className="glass-card border-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Atribuir Acesso
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Selecionar Chatter</Label>
                <Select value={selectedChatter} onValueChange={setSelectedChatter}>
                  <SelectTrigger className="bg-secondary/50 border-border/50">
                    <SelectValue placeholder="Escolha um chatter..." />
                  </SelectTrigger>
                  <SelectContent>
                    {chatters.map(chatter => (
                      <SelectItem key={chatter.id} value={chatter.id.toString()}>
                        {chatter.name} ({chatter.username})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Selecionar Modelo</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="bg-secondary/50 border-border/50">
                    <SelectValue placeholder="Escolha uma modelo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeModels.map((model: Model) => (
                      <SelectItem key={model.id} value={model.id.toString()}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                onClick={handleAssign} 
                disabled={!selectedChatter || !selectedModel || isAssigning}
                className="w-full bg-primary hover:bg-primary/90 mt-4"
              >
                {isAssigning ? "Atribuindo..." : "Atribuir Acesso"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="bg-card border-border/40">
            <CardHeader>
              <CardTitle className="text-white">Permissões Ativas</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-secondary/30">
                    <TableRow className="border-border/40 hover:bg-transparent">
                      <TableHead className="text-white">Chatter</TableHead>
                      <TableHead className="text-white">Acesso à Modelo</TableHead>
                      <TableHead className="text-white">Data de Atribuição</TableHead>
                      <TableHead className="text-center text-white">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrichedPermissions?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          Nenhuma permissão atribuída ainda.
                        </TableCell>
                      </TableRow>
                    ) : (
                      enrichedPermissions?.map((perm: any) => (
                        <TableRow key={perm.id} className="border-border/40 hover:bg-white/5">
                          <TableCell className="font-medium text-white">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] text-white font-semibold overflow-hidden">
                                {perm.chatter?.avatar ? (
                                  <img src={perm.chatter.avatar} alt={perm.chatter.name} className="w-full h-full object-cover" />
                                ) : (
                                  perm.chatter?.name?.charAt(0).toUpperCase()
                                )}
                              </div>
                              {perm.chatter?.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[10px] overflow-hidden">
                                {perm.model?.avatar ? (
                                  <img src={perm.model.avatar} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  perm.model?.name?.charAt(0).toUpperCase()
                                )}
                              </div>
                              {perm.model?.name}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(perm.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => revoke(perm.id)}
                              disabled={isRevoking}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
