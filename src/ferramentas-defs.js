// Gerado por scripts/gera-defs-ferramentas.mjs a partir de src/ferramentas (o pacote precisa do Node; o Edge só usa
// nomes, descrições e esquemas). Não edite à mão: rode o script de novo quando o pacote mudar.
export const DEFINICOES = [
  {
    "name": "cve_consultar",
    "description": "Consulta um CVE pelo ID: descrição, nota CVSS e vetor, CWE, se está na lista de exploração conhecida da CISA (KEV) com data, probabilidade de exploração (EPSS) e referências. Use antes de responder sobre um CVE específico e cite as fontes.",
    "schema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "description": "ID do CVE, ex.: CVE-2021-44228"
        }
      },
      "required": [
        "id"
      ]
    }
  },
  {
    "name": "cve_buscar",
    "description": "Busca CVEs por palavra-chave (produto, biblioteca, fornecedor) no NVD. Pode filtrar só os que estão na lista KEV da CISA e por nota CVSS mínima. Devolve os mais recentes primeiro.",
    "schema": {
      "type": "object",
      "properties": {
        "termo": {
          "type": "string"
        },
        "so_kev": {
          "type": "boolean"
        },
        "cvss_min": {
          "type": "number"
        },
        "limite": {
          "type": "number",
          "description": "até 20"
        }
      },
      "required": [
        "termo"
      ]
    }
  },
  {
    "name": "pacote_vulnerabilidades",
    "description": "Lista falhas conhecidas de um pacote de software (npm, PyPI, Maven, Go, crates.io, NuGet, RubyGems, Packagist, Debian, Ubuntu e outros) pelo OSV, com versões afetadas e corrigidas. Informe a versão para saber se ela está vulnerável.",
    "schema": {
      "type": "object",
      "properties": {
        "pacote": {
          "type": "string",
          "description": "ex.: lodash, django, org.apache.logging.log4j:log4j-core"
        },
        "ecossistema": {
          "type": "string",
          "description": "npm, PyPI, Maven, Go, crates.io, NuGet, RubyGems, Packagist, Debian, Ubuntu…"
        },
        "versao": {
          "type": "string"
        }
      },
      "required": [
        "pacote",
        "ecossistema"
      ]
    }
  },
  {
    "name": "pagina_ler",
    "description": "Lê uma página pública (aviso de segurança, changelog, relatório, política de programa de bug bounty) e devolve o texto. Só http/https nas portas 80 e 443, respeita robots.txt e recusa endereços internos. Use só com URLs que o usuário mandou ou que vieram de uma busca ou consulta de CVE.",
    "schema": {
      "type": "object",
      "properties": {
        "url": {
          "type": "string"
        },
        "max_caracteres": {
          "type": "number",
          "description": "até 30000 (padrão 12000)"
        }
      },
      "required": [
        "url"
      ]
    }
  },
  {
    "name": "ip_info",
    "description": "Dados públicos de um IP: dono e faixa (RDAP), país, ASN e operadora, DNS reverso e portas e serviços vistos por varreduras públicas (Shodan InternetDB). Não envia nenhum pacote ao IP.",
    "schema": {
      "type": "object",
      "properties": {
        "ip": {
          "type": "string"
        }
      },
      "required": [
        "ip"
      ]
    }
  },
  {
    "name": "dominio_info",
    "description": "Dados públicos de um domínio: registros DNS (A, AAAA, MX, NS, TXT, CAA, SOA), registro no RDAP (registrador, datas, status, servidores de nome) e subdomínios vistos em certificados públicos (crt.sh).",
    "schema": {
      "type": "object",
      "properties": {
        "dominio": {
          "type": "string"
        },
        "subdominios": {
          "type": "boolean",
          "description": "buscar subdomínios no crt.sh (padrão true)"
        }
      },
      "required": [
        "dominio"
      ]
    }
  },
  {
    "name": "asn_info",
    "description": "Dados públicos de um sistema autônomo (ASN): dono, se está anunciado e as faixas de IP anunciadas (RIPEstat).",
    "schema": {
      "type": "object",
      "properties": {
        "asn": {
          "type": "string",
          "description": "ex.: AS13335 ou 13335"
        }
      },
      "required": [
        "asn"
      ]
    }
  },
  {
    "name": "site_checar",
    "description": "Visita um site uma vez, como um navegador, e relata: status e redirecionamentos, servidor e tecnologia aparente, cabeçalhos de segurança presentes ou ausentes (HSTS, CSP, X-Frame-Options e outros), atributos dos cookies e o certificado TLS (emissor, validade, dias restantes). Não testa falhas nem envia payloads.",
    "schema": {
      "type": "object",
      "properties": {
        "url": {
          "type": "string"
        }
      },
      "required": [
        "url"
      ]
    }
  },
  {
    "name": "portas_publicas",
    "description": "Portas, serviços e CVEs associados a um host, segundo varreduras públicas já feitas por terceiros (Shodan InternetDB). Resolve o nome e consulta cada IP. O 451 não varre nem testa portas.",
    "schema": {
      "type": "object",
      "properties": {
        "host": {
          "type": "string",
          "description": "domínio ou IP"
        }
      },
      "required": [
        "host"
      ]
    }
  }
];

export const INSTRUCAO_SISTEMA = "Você tem ferramentas de consulta: cve_consultar, cve_buscar, pacote_vulnerabilidades, pagina_ler, ip_info, dominio_info, asn_info, site_checar e portas_publicas. Use-as antes de afirmar fatos sobre CVEs, pacotes, IPs, domínios ou sites, e cite as fontes como [n], na mesma numeração que a ferramenta devolveu. As ferramentas de rede só usam dados públicos: não diga que o 451 varreu ou testou o alvo.";
