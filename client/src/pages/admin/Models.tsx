import { useState } from "react";
import { useModels, useCreateModel, useUpdateModel, useDeleteModel } from "@/hooks/use-models";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Loader2 } from "lucide-react";
import type { InsertModel, Model, UpdateModelRequest } from "@shared/schema";

export default function Models() {
  const { data: models, isLoading } = useModels();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);

  const filteredModels = models?.filter((m: Model) => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.platformEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const canEdit = user?.role === 'admin' || user?.role === 'dev';

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl text-white mb-2">Modelos</h1>
          <p className="text-muted-foreground">Gerencie contas da plataforma para modelos.</p>
        </div>
        {canEdit && (
          <Button onClick={() => setIsCreateOpen(true)} className="bg-primary hover:bg-primary/90 border border-white/10">
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Modelo
          </Button>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border/40 overflow-hidden shadow-lg">
        <div className="p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input 
              placeholder="Buscar modelos..." 
              className="pl-10 bg-secondary/50 border-border/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="px-2">
            <Table>
              <TableHeader className="bg-secondary/30 rounded-lg">
                <TableRow className="hover:bg-transparent border-border/40">
                  <TableHead className="text-gray-300 w-[35%]">Nome</TableHead>
                  <TableHead className="text-center text-gray-300">Chat</TableHead>
                  <TableHead className="text-gray-300">Email da Plataforma</TableHead>
                  <TableHead className="text-center text-gray-300 w-[140px]">Status</TableHead>
                  <TableHead className="text-center text-gray-300 w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredModels?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Nenhum modelo encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredModels?.map((model: Model) => (
                    <ModelRow 
                      key={model.id} 
                      model={model} 
                      onEdit={() => setEditingModel(model)} 
                      canEdit={canEdit}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <CreateModelDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      {editingModel && (
        <EditModelDialog 
          model={editingModel} 
          open={!!editingModel} 
          onOpenChange={(open) => !open && setEditingModel(null)} 
        />
      )}
    </div>
  );
}

function ModelRow({ model, onEdit, canEdit }: { model: Model, onEdit: () => void, canEdit: boolean }) {
  const { mutate: deleteModel, isPending: isDeleting } = useDeleteModel();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const isValidated = (model as any).isValidated;

  return (
    <TableRow className="border-border/40 hover:bg-white/5 transition-colors">
      <TableCell className="font-medium text-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs overflow-hidden">
             {model.avatar ? (
               <img src={model.avatar} alt={model.name} className="w-full h-full object-cover" />
             ) : (
               model.name.charAt(0).toUpperCase()
             )}
          </div>
          {model.name}
        </div>
      </TableCell>
      <TableCell className="text-center">
        {model.chatGroup ? (
          <Badge 
            variant="outline" 
            className={`
              ${model.chatGroup === 'Chat 1' ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10' : ''}
              ${model.chatGroup === 'Chat 2' ? 'border-pink-500 text-pink-400 bg-pink-500/10' : ''}
              ${!['Chat 1', 'Chat 2'].includes(model.chatGroup || '') ? 'border-gray-500 text-gray-400' : ''}
            `}
          >
            {model.chatGroup}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-gray-500 text-gray-400 bg-gray-500/10">Sem Chat</Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{model.platformEmail || "-"}</TableCell>
      <TableCell className="text-center">
        <div className="flex items-center justify-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isValidated ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm">{isValidated ? 'Validada' : 'Invalidada'}</span>
        </div>
      </TableCell>
      <TableCell className="text-center">
        {canEdit && (
          <div className="flex justify-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onEdit}
              className="text-muted-foreground hover:text-white hover:bg-white/10"
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost"  
              size="icon" 
              onClick={() => setShowDeleteAlert(true)}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </Button>
          </div>
        )}
        
        <Dialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Excluir Modelo</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir {model.name}? Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteAlert(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => deleteModel(model.id)}>Excluir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function CreateModelDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { mutate: createModel, isPending } = useCreateModel();
  const [formData, setFormData] = useState<{
    name: string;
    platformEmail: string;
    platformPassword: string;
    avatar: string;
    cover: string;
    status: "active" | "inactive" | null;
    chatGroup: string;
    proxyUrl: string;
  }>({
    name: "",
    platformEmail: "",
    platformPassword: "",
    avatar: "",
    cover: "",
    status: "active",
    chatGroup: "",
    proxyUrl: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload: InsertModel = {
      name: formData.name,
      platformEmail: formData.platformEmail,
      platformPassword: formData.platformPassword,
      status: formData.status,
      chatGroup: formData.chatGroup || null,
      avatar: formData.avatar || null,
      cover: formData.cover || null,
      proxyUrl: formData.proxyUrl || null,
    };

    createModel(payload, {
      onSuccess: () => {
        onOpenChange(false);
        setFormData({ 
          name: "", 
          platformEmail: "", 
          platformPassword: "", 
          avatar: "", 
          cover: "", 
          status: "active", 
          chatGroup: "", 
          proxyUrl: "" 
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle>Adicionar Novo Modelo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome do Modelo</Label>
            <Input 
              required 
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <Label>Email da Plataforma</Label>
            <Input 
              required 
              type="email"
              value={formData.platformEmail}
              onChange={(e) => setFormData({...formData, platformEmail: e.target.value})}
              className="bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <Label>Senha da Plataforma</Label>
            <Input 
              required 
              type="password"
              value={formData.platformPassword}
              onChange={(e) => setFormData({...formData, platformPassword: e.target.value})}
              className="bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <Label>Chat</Label>
            <Select 
              value={formData.chatGroup || "none"} 
              onValueChange={(val) => setFormData({
                ...formData,
                chatGroup: val === "none" ? "" : val
              })}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue placeholder="Selecione um chat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem chat</SelectItem>
                <SelectItem value="Chat 1">Chat 1</SelectItem>
                <SelectItem value="Chat 2">Chat 2</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Proxy URL</Label>
            <Input 
              value={formData.proxyUrl || ""}
              onChange={(e) => setFormData({...formData, proxyUrl: e.target.value})}
              className="bg-secondary/50"
              placeholder="http://user:pass@host:port"
            />
          </div>
          <div className="space-y-2">
            <Label>Foto (Opcional)</Label>
            <Input 
              type="file"
              accept="image/*"
              className="bg-secondary/50"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) {
                  setFormData({ ...formData, avatar: "" });
                  return;
                }
                const base64 = await fileToBase64(file);
                setFormData({ ...formData, avatar: base64 });
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Capa (Opcional)</Label>
            <Input 
              type="file"
              accept="image/*"
              className="bg-secondary/50"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) {
                  setFormData({ ...formData, cover: "" });
                  return;
                }
                const base64 = await fileToBase64(file);
                setFormData({ ...formData, cover: base64 });
              }}
            />
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending} className="bg-primary hover:bg-primary/90">
              {isPending ? "Criando..." : "Criar Modelo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditModelDialog({ model, open, onOpenChange }: { model: Model, open: boolean, onOpenChange: (open: boolean) => void }) {
  const { mutate: updateModel, isPending } = useUpdateModel();
  const [formData, setFormData] = useState({
    name: model.name,
    platformEmail: model.platformEmail,
    platformPassword: "",
    avatar: model.avatar || "",
    cover: model.cover || "",
    chatGroup: model.chatGroup || "",
    proxyUrl: model.proxyUrl || ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const updates: UpdateModelRequest = {
      name: formData.name,
      platformEmail: formData.platformEmail,
    };

    if (formData.avatar !== undefined) updates.avatar = formData.avatar?.trim() || null;
    if (formData.cover !== undefined) updates.cover = formData.cover?.trim() || null;
    if (formData.chatGroup !== undefined) updates.chatGroup = formData.chatGroup || null;
    if (formData.proxyUrl !== undefined) updates.proxyUrl = formData.proxyUrl?.trim() || null;
    
    // Only include password if it's not empty
    if (formData.platformPassword && formData.platformPassword.trim() !== "") {
      updates.platformPassword = formData.platformPassword;
    }

    updateModel({ id: model.id, ...updates }, {
      onSuccess: () => onOpenChange(false),
      onError: (error: any) => {
        console.error("Erro detalhado:", error);
        alert("Erro ao atualizar: " + (error.message || JSON.stringify(error) || "Erro desconhecido"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle>Editar Modelo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome do Modelo</Label>
            <Input 
              required 
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <Label>Email da Plataforma</Label>
            <Input 
              required 
              type="email"
              value={formData.platformEmail}
              onChange={(e) => setFormData({...formData, platformEmail: e.target.value})}
              className="bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <Label>Senha da Plataforma (Deixe em branco para manter)</Label>
            <Input 
              type="password"
              placeholder="Nova senha..."
              onChange={(e) => setFormData({...formData, platformPassword: e.target.value})}
              className="bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <Label>Chat</Label>
            <Select 
              value={formData.chatGroup || ""} 
              onValueChange={(val) => setFormData({...formData, chatGroup: val})}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue placeholder="Selecione um chat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Chat 1">Chat 1</SelectItem>
                <SelectItem value="Chat 2">Chat 2</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Proxy URL</Label>
            <Input 
              value={formData.proxyUrl || ""}
              onChange={(e) => setFormData({...formData, proxyUrl: e.target.value})}
              className="bg-secondary/50"
              placeholder="http://user:pass@host:port"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Foto (Opcional)</Label>
              {formData.avatar && formData.avatar.trim() !== "" && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, avatar: "" })}
                  className="inline-flex items-center justify-center rounded-md p-1 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              )}
            </div>
            <Input 
              type="file"
              accept="image/*"
              className="bg-secondary/50"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) {
                  setFormData({ ...formData, avatar: "" });
                  return;
                }
                const base64 = await fileToBase64(file);
                setFormData({ ...formData, avatar: base64 });
              }}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Capa (Opcional)</Label>
              {formData.cover && formData.cover.trim() !== "" && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, cover: "" })}
                  className="inline-flex items-center justify-center rounded-md p-1 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              )}
            </div>
            <Input 
              type="file"
              accept="image/*"
              className="bg-secondary/50"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) {
                  setFormData({ ...formData, cover: "" });
                  return;
                }
                const base64 = await fileToBase64(file);
                setFormData({ ...formData, cover: base64 });
              }}
            />
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending} className="bg-primary hover:bg-primary/90">
              {isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
