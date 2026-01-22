import { useState } from "react";
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@/hooks/use-users";
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
import { Plus, Pencil, Trash2, Search, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { InsertUser, User } from "@shared/schema";

export default function Users() {
  const { data: users, isLoading } = useUsers();
  const { user: currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const filteredUsers = users?.filter(u => 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.name.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => {
    const rolePriority: Record<string, number> = {
      dev: 0,
      admin: 1,
      supervisor: 2,
      chatter: 3
    };

    const priorityA = rolePriority[a.role] ?? 99;
    const priorityB = rolePriority[b.role] ?? 99;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Se ambos forem chatter, ordenar por chatGroup
    if (a.role === 'chatter' && b.role === 'chatter') {
      const chatA = a.chatGroup || '';
      const chatB = b.chatGroup || '';
      return chatA.localeCompare(chatB);
    }

    return 0;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl text-white mb-2">Usuários</h1>
          <p className="text-muted-foreground">Gerencie devs, administradores, supervisores e chatters do sistema.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="bg-primary hover:bg-primary/90 border border-white/10">
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Usuário
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border/40 overflow-hidden shadow-lg">
        <div className="p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input 
              placeholder="Buscar usuários..." 
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
                  <TableHead className="text-gray-300">Nome</TableHead>
                  <TableHead className="text-gray-300">Usuário</TableHead>
                  <TableHead className="text-gray-300">Chat</TableHead>
                  <TableHead className="text-gray-300">Função</TableHead>
                  <TableHead className="text-gray-300">Status</TableHead>
                  <TableHead className="text-center text-gray-300">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nenhum usuário encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers?.map((user) => (
                    <UserRow 
                      key={user.id} 
                      user={user} 
                      onEdit={() => setEditingUser(user)} 
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <CreateUserDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      {editingUser && (
        <EditUserDialog 
          user={editingUser} 
          open={!!editingUser} 
          onOpenChange={(open) => !open && setEditingUser(null)} 
        />
      )}
    </div>
  );
}

function UserRow({ user, onEdit }: { user: User, onEdit: () => void }) {
  const { user: currentUser } = useAuth();
  const { mutate: deleteUser, isPending: isDeleting } = useDeleteUser();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);

  const isDevUser = user.role === 'dev';
  const isCurrentUserDev = currentUser?.role === 'dev';
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'dev';
  
  const canModify = isAdminOrDev && (!isDevUser || isCurrentUserDev);

  const lastActiveAt = (user as any).lastActiveAt ? new Date((user as any).lastActiveAt) : null;
  const isOnline = user.active && lastActiveAt && Date.now() - lastActiveAt.getTime() < 60000;

  return (
    <TableRow className="border-border/40 hover:bg-white/5 transition-colors">
      <TableCell className="font-medium text-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs overflow-hidden">
             {user.avatar ? (
               <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
             ) : (
               user.name.charAt(0).toUpperCase()
             )}
          </div>
          {user.name}
        </div>
      </TableCell>
      <TableCell>{user.username}</TableCell>
      <TableCell>
        {(user.role === 'dev' || user.role === 'admin') ? null : user.chatGroup ? (
          <Badge 
            variant="outline" 
            className={`
              ${user.chatGroup === 'Chat 1' ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10' : ''}
              ${user.chatGroup === 'Chat 2' ? 'border-pink-500 text-pink-400 bg-pink-500/10' : ''}
              ${!['Chat 1', 'Chat 2'].includes(user.chatGroup || '') ? 'border-gray-500 text-gray-400' : ''}
            `}
          >
            {user.chatGroup}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-gray-500 text-gray-400 bg-gray-500/10">Sem Chat</Badge>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={
          user.role === 'dev' ? "border-red-500 text-red-400" :
          user.role === 'admin' ? "border-orange-500 text-orange-400" : 
          user.role === 'supervisor' ? "border-purple-500 text-purple-400" : 
          "border-blue-500 text-blue-400"
        }>
          {user.role}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              !user.active ? "bg-gray-500" : isOnline ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="text-sm">
            {!user.active ? "Desativado" : isOnline ? "Online" : "Offline"}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-center">
        {canModify && (
          <div className="flex justify-center gap-2">
            <Button variant="ghost" size="icon" onClick={onEdit} className="hover:text-primary hover:bg-primary/10">
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
              <DialogTitle>Excluir Usuário</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir {user.name}? Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteAlert(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => deleteUser(user.id)}>Excluir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

function CreateUserDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { mutate: createUser, isPending } = useCreateUser();
  const { user: currentUser } = useAuth();
  const [formData, setFormData] = useState<InsertUser>({
    name: "",
    username: "",
    password: "",
    role: "chatter",
    active: true,
    chatGroup: "",
    avatar: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createUser(formData, {
      onSuccess: () => {
        onOpenChange(false);
        setFormData({ 
          name: "", 
          username: "", 
          password: "", 
          role: "chatter", 
          active: true,
          chatGroup: "",
          avatar: ""
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle>Criar Novo Usuário</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome Completo</Label>
            <Input 
              required 
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <Label>Usuário</Label>
            <Input 
              required 
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
              className="bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <Label>Senha</Label>
            <Input 
              required 
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              className="bg-secondary/50"
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
            <Label>Função</Label>
              <Select 
              value={formData.role} 
              onValueChange={(val: "dev" | "admin" | "supervisor" | "chatter") => setFormData({...formData, role: val})}
              >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chatter">Chatter</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                {currentUser?.role === 'dev' && <SelectItem value="dev">Dev</SelectItem>}
              </SelectContent>
              </Select>
          </div>
          {formData.role === 'chatter' && (
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
          )}
          <DialogFooter className="mt-6">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending} className="bg-primary hover:bg-primary/90">
              {isPending ? "Criando..." : "Criar Usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, open, onOpenChange }: { user: User, open: boolean, onOpenChange: (open: boolean) => void }) {
  const { mutate: updateUser, isPending } = useUpdateUser();
  const { user: currentUser } = useAuth();
  const [formData, setFormData] = useState({
    name: user.name,
    username: user.username,
    role: user.role,
    active: user.active,
    chatGroup: user.chatGroup,
    avatar: user.avatar || ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Construct a clean update object
    const updates: Partial<InsertUser> = {
      name: formData.name,
      username: formData.username,
      role: formData.role,
      active: formData.active,
      avatar: formData.avatar || null,
    };

    // Handle chatGroup: send null if empty string, or the string if present
    if (formData.role === 'chatter') {
        updates.chatGroup = formData.chatGroup || null;
    } else {
        updates.chatGroup = null; // Clear chat group if role is not chatter
    }

    updateUser({ id: user.id, ...updates }, {
      onSuccess: () => onOpenChange(false),
      onError: (error: any) => {
        console.error("Erro ao atualizar usuário:", error);
        alert("Erro ao atualizar: " + (error.message || JSON.stringify(error)));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle>Editar Usuário</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome Completo</Label>
            <Input 
              required 
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <Label>Usuário</Label>
            <Input 
              required 
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
              className="bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Foto (Opcional)</Label>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, avatar: "" })}
                className="inline-flex items-center justify-center rounded-md p-1 hover:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
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
            <Label>Função</Label>
            <Select 
              value={formData.role} 
              onValueChange={(val: "dev" | "admin" | "supervisor" | "chatter") => setFormData({...formData, role: val})}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
              <SelectItem value="chatter">Chatter</SelectItem>
              <SelectItem value="supervisor">Supervisor</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              {currentUser?.role === 'dev' && <SelectItem value="dev">Dev</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          {formData.role === 'chatter' && (
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
          )}
          <div className="space-y-2">
            <Label>Status</Label>
            <Select 
              value={formData.active ? "active" : "inactive"} 
              onValueChange={(val) => setFormData({...formData, active: val === "active"})}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
