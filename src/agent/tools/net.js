export const tools = {
  net_fetch: {
    name: 'net_fetch',
    description: 'Requisição crua (status, headers, body)',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        method: { type: 'string' },
        headers: { type: 'object' },
        body: { type: 'string' }
      },
      required: ['url']
    },
    run: async (args) => {
      // TODO: implementar (Fase 8)
      return 'not implemented';
    }
  },
  net_scrape: {
    name: 'net_scrape',
    description: 'Fetch + linkedom',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        selector: { type: 'string' },
        as: { type: 'string' }
      },
      required: ['url']
    },
    run: async (args) => {
      // TODO: implementar (Fase 8)
      return 'not implemented';
    }
  },
  net_clone: {
    name: 'net_clone',
    description: 'Clona página estática (HTML, CSS, JS, imagens)',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        depth: { type: 'number' }
      },
      required: ['url']
    },
    run: async (args) => {
      // TODO: implementar (Fase 8)
      return 'not implemented';
    }
  },
  net_recon: {
    name: 'net_recon',
    description: 'Recon (headers, tech fingerprint, robots)',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string' }
      },
      required: ['url']
    },
    run: async (args) => {
      // TODO: implementar (Fase 8)
      return 'not implemented';
    }
  }
};
