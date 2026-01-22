import pLimit from 'p-limit';
import { storage } from "./storage";

// Limitador de concorrência para evitar sobrecarga do sistema
const CONCURRENT_SESSIONS_LIMIT = 10; // Máximo de 10 sessões simultâneas
const limit = pLimit(CONCURRENT_SESSIONS_LIMIT);

// Pool de recursos para gerenciar múltiplos chatters
class ResourceManager {
  private activeSessions = new Map<string, {
    modelId: number;
    userId: number;
    context?: any; // Playwright context or null for native
    process?: any; // Native child process
    lastActivity: Date;
    isAdmin: boolean;
    userName?: string;
    modelName?: string;
    chatGroup?: string;
    startTime?: Date;
  }>();
  
  private sessionQueue = new Map<number, Array<{
    requestId: string;
    userId: number;
    isAdmin: boolean;
    createFn: Function;
    resolve: Function;
    reject: Function;
    timestamp: Date;
  }>>();

  // Verifica se pode iniciar nova sessão
  canStartSession(modelId: number, isAdmin: boolean): boolean {
    const modelSessions = Array.from(this.activeSessions.values())
      .filter(s => s.modelId === modelId);
    
    // Admin sempre pode (apenas 1 por modelo)
    if (isAdmin) {
      return modelSessions.filter(s => s.isAdmin).length === 0;
    }
    
    // Chatters: máximo 8 por modelo (reserva 2 slots para admin)
    return modelSessions.filter(s => !s.isAdmin).length < 8;
  }

  // Verifica se há sessão admin ativa para o modelo
  hasActiveAdminSession(modelId: number): boolean {
    const sessions = Array.from(this.activeSessions.values());
    return sessions.some(s => s.modelId === modelId && s.isAdmin);
  }

  // Adiciona sessão ao pool
  addSession(key: string, session: any) {
    if (this.activeSessions.has(key)) {
      console.log(`[Resource] Substituindo sessão existente: ${key}`);
      const oldSession = this.activeSessions.get(key);
      try {
        if (oldSession?.context) oldSession.context.close().catch(() => {});
        if (oldSession?.process) oldSession.process.kill();
      } catch (e) {
        console.error(`[Resource] Erro ao fechar sessão antiga ${key}:`, e);
      }
    }

    this.activeSessions.set(key, {
      ...session,
      startTime: session.startTime || new Date(),
      lastActivity: new Date()
    });
    console.log(`[Resource] Sessão adicionada: ${key} (${this.activeSessions.size} ativas)`);
  }

  // Remove sessão do pool
  removeSession(key: string) {
    const session = this.activeSessions.get(key);
    if (session) {
      if (!session.isAdmin && session.modelName && session.userName) {
        storage.createSystemLog({
          type: "info",
          message: `saiu do chat de ${session.modelName}`,
          userName: session.userName,
          role: "chatter"
        }).catch((e: any) => {
          console.error("[Resource] Failed to log chat exit:", e);
        });
      }
      this.activeSessions.delete(key);
    } else {
      this.activeSessions.delete(key);
    }
    console.log(`[Resource] Sessão removida: ${key} (${this.activeSessions.size} ativas)`);
  }

  // Atualiza atividade
  updateActivity(key: string) {
    const session = this.activeSessions.get(key);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  // Busca contexto da sessão ativa
  getSessionContext(modelId: number, userId: number): any {
    const key = `${modelId}_${userId}_chatter`;
    return this.activeSessions.get(key)?.context;
  }

  // Limpa sessões inativas (mais de 2 horas)
  cleanupInactiveSessions() {
    const now = new Date();
    const twoHours = 2 * 60 * 60 * 1000;
    
    this.activeSessions.forEach((session, key) => {
      if (now.getTime() - session.lastActivity.getTime() > twoHours) {
        console.log(`[Resource] Limpando sessão inativa: ${key}`);
        try {
          if (session.context) session.context.close();
          if (session.process) session.process.kill();
        } catch (e) {}
        this.removeSession(key);
      }
    });
  }

  // Força o fechamento de todas as sessões de um modelo
  async forceCloseSessionsForModel(modelId: number) {
    console.log(`[Resource] Forçando fechamento de sessões para modelo ${modelId}`);
    const sessionsToClose: string[] = [];

    this.activeSessions.forEach((session, key) => {
      if (session.modelId === modelId) {
        sessionsToClose.push(key);
        try {
          if (session.context) {
            session.context.close().catch((e: any) => console.error(`Erro ao fechar contexto: ${e.message}`));
          }
          if (session.process) {
            session.process.kill();
          }
        } catch (e) {
          console.error(`Erro ao fechar sessão ${key}:`, e);
        }
      }
    });

    sessionsToClose.forEach(key => this.removeSession(key));
    
    // Aguarda um momento para garantir que os processos morreram
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Fecha TODAS as sessões (shutdown)
  async killAllSessions() {
    console.log(`[Resource] Encerrando todas as ${this.activeSessions.size} sessões...`);
    const promises: Promise<void>[] = [];
    
    this.activeSessions.forEach((session, key) => {
        promises.push(new Promise(resolve => {
            try {
                if (session.context) session.context.close().catch(() => {});
                if (session.process) {
                    session.process.kill(); 
                    // Se não morrer em 2s, força
                    setTimeout(() => {
                        try { session.process.kill('SIGKILL'); } catch {}
                    }, 2000);
                }
            } catch (e) {
                console.error(`Erro ao matar sessão ${key}:`, e);
            }
            resolve();
        }));
    });

    await Promise.all(promises);
    this.activeSessions.clear();
    console.log(`[Resource] Todas as sessões encerradas.`);
  }

  // Queue para gerenciar demanda alta
  async queueSession(modelId: number, userId: number, isAdmin: boolean, createFn: Function) {
    // Se não pode iniciar agora, coloca na fila
    if (!this.canStartSession(modelId, isAdmin)) {
      console.log(`[Resource] Sessão em fila para modelo ${modelId} (usuário ${userId})`);
      
      const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      return new Promise((resolve, reject) => {
        if (!this.sessionQueue.has(modelId)) {
          this.sessionQueue.set(modelId, []);
        }
        
        this.sessionQueue.get(modelId)!.push({
          requestId,
          userId,
          isAdmin,
          createFn,
          resolve,
          reject,
          timestamp: new Date()
        });

        // Timeout de 30 segundos na fila
        setTimeout(() => {
          const queue = this.sessionQueue.get(modelId) || [];
          const index = queue.findIndex(q => q.requestId === requestId);
          if (index >= 0) {
            queue.splice(index, 1);
            reject(new Error('Timeout na fila de sessões'));
          }
        }, 30000);
      });
    }

    // Executa com limitador de concorrência
    return await limit(async () => {
      try {
        const result = await createFn();
        
        // Processa próxima da fila se houver
        setTimeout(() => this.processQueue(modelId), 100);
        
        return result;
      } catch (error) {
        // Processa próxima da fila em caso de erro
        setTimeout(() => this.processQueue(modelId), 100);
        throw error;
      }
    });
  }

  // Processa fila de sessões pendentes
  private async processQueue(modelId: number) {
    const queue = this.sessionQueue.get(modelId);
    if (!queue || queue.length === 0) return;

    // Verifica se pode iniciar a próxima
    const next = queue[0];
    if (this.canStartSession(modelId, next.isAdmin)) {
      queue.shift();
      
      try {
        // Executa a função de criação original
        const result = await limit(async () => {
             return await next.createFn();
        });
        
        // Processa recursivamente caso haja mais vagas
        setTimeout(() => this.processQueue(modelId), 100);
        
        next.resolve(result);
      } catch (error) {
        // Mesmo se falhar, tenta o próximo
        setTimeout(() => this.processQueue(modelId), 100);
        next.reject(error);
      }
    }
  }

  // Estatísticas
  getStats() {
    const stats = {
      totalActive: this.activeSessions.size,
      byModel: {} as Record<number, { admin: number; chatters: number }>,
      queues: {} as Record<number, number>
    };

    // Conta por modelo
    this.activeSessions.forEach((session) => {
      if (!stats.byModel[session.modelId]) {
        stats.byModel[session.modelId] = { admin: 0, chatters: 0 };
      }
      
      if (session.isAdmin) {
        stats.byModel[session.modelId].admin++;
      } else {
        stats.byModel[session.modelId].chatters++;
      }
    });

    // Conta filas
    this.sessionQueue.forEach((queue, modelId) => {
      stats.queues[modelId] = queue.length;
    });

    return stats;
  }

  getActiveSessions() {
    return Array.from(this.activeSessions.entries()).map(([key, s]) => ({
      key,
      modelId: s.modelId,
      userId: s.userId,
      userName: s.userName,
      modelName: s.modelName,
      chatGroup: s.chatGroup,
      startTime: s.startTime,
      lastActivity: s.lastActivity,
      isAdmin: s.isAdmin,
    }));
  }
}

// Instância singleton
export const resourceManager = new ResourceManager();

// Limpeza periódica (a cada 30 minutos)
setInterval(() => {
  resourceManager.cleanupInactiveSessions();
}, 30 * 60 * 1000);

// Exporta limitador para uso direto quando necessário
export { limit };
