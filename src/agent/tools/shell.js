export const tools = {
  shell: {
    name: 'shell',
    description: 'Executa comando via bash (cwd no workspace, timeout 60s)',
    schema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        cwd: { type: 'string' },
        timeout: { type: 'number' }
      },
      required: ['command']
    },
    run: async (args) => {
      // TODO: implementar (Fase 7)
      // - Execução com aprovação (salva em approvals com decision: pending)
      // - Emite approval_request para o loop pausar
      // - Só continua com POST /api/approve
      return 'not implemented';
    }
  }
};
