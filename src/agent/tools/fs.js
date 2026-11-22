export const tools = {
  fs_read: {
    name: 'fs_read',
    description: 'Lê arquivo do workspace',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        offset: { type: 'number' },
        limit: { type: 'number' }
      },
      required: ['path']
    },
    run: async (args) => {
      // TODO: implementar (Fase 7)
      return 'not implemented';
    }
  },
  fs_write: {
    name: 'fs_write',
    description: 'Escreve/cria arquivo (cria dirs)',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['path', 'content']
    },
    run: async (args) => {
      // TODO: implementar (Fase 7)
      return 'not implemented';
    }
  },
  fs_list: {
    name: 'fs_list',
    description: 'Lista árvore de arquivos',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        depth: { type: 'number' }
      },
      required: ['path']
    },
    run: async (args) => {
      // TODO: implementar (Fase 7)
      return 'not implemented';
    }
  },
  fs_edit: {
    name: 'fs_edit',
    description: 'Substituição literal (find → replace)',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        find: { type: 'string' },
        replace: { type: 'string' }
      },
      required: ['path', 'find', 'replace']
    },
    run: async (args) => {
      // TODO: implementar (Fase 7)
      return 'not implemented';
    }
  }
};
