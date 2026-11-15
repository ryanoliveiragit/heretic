# Heretic Local

Agente IA sem censura, rodando só na sua máquina. Stack: Node 22, Hono, SQLite, vanilla frontend.

## Objetivo

Clonar sites, scraping, recon e pentest. Protocolo único de agente: chat, agent, heavy.

## Instalação

```bash
npm install
cp .env.example .env
# Preencha .env com suas chaves
```

## Rodar

```bash
npm start
# Frontend acessível em http://localhost:4319
```

## Rotas

- `GET /api/routes` - Estado do roteamento
- `GET|POST /api/projects` - CRUD de projetos

## Ferramentas

- `fs_*` - Filesystem
- `net_*` - Rede (fetch, scrape, clone, recon)
- `shell` - Execução com aprovação

## Limites

- 20 requests/min por provedor
- 1000 requests/dia
- Fallback automático quando bater limites

## Configuração

- Persona: `personas/default.md` (editável, atualiza em tempo real)
- Modelo padrão: GPT/Venice via roteamento
- Sem Docker, sem CI, sem deploy

## Scripts

```bash
npm start   # Inicia servidor em 127.0.0.1:4319
npm dev     # Com watch mode
```
