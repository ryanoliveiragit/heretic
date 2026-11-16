// Catálogo dos agentes especialistas — o diferencial do Heretic.
// Moldura: uso em segurança autorizada (lab próprio, escopo, CTF, estudo).

export type Mascot = "ghost" | "cube" | "pixel";

export interface Agent {
  id: string;
  name: string;
  mascot: Mascot;
  focus: string;
  tools: string[];
  examples: string[];
}

export const AGENTS: Agent[] = [
  { id: "pentest", name: "Pentester", mascot: "ghost",
    focus: "Recon, enumeration and exploitation in scope or in your lab. Report at the end.",
    tools: ["nmap", "ffuf", "nuclei", "metasploit"],
    examples: ["Pentest plan for 10.0.0.0/24 in my lab", "Enumerate services and versions on this target", "Write up what we found"] },
  { id: "recon", name: "Recon & OSINT", mascot: "cube",
    focus: "Map the attack surface: subdomains, ports and public leads.",
    tools: ["subfinder", "amass", "httpx", "whois"],
    examples: ["Enumerate subdomains of example.com", "What ports and services does this host run?", "Map the attack surface"] },
  { id: "scraping", name: "Scraping & Data", mascot: "cube",
    focus: "Pull and structure data from public pages, ready to analyze.",
    tools: ["playwright", "http", "HTML parser", "regex"],
    examples: ["Extract this page's table as CSV", "Paginate and collect every item", "Clean and normalize this data"] },
  { id: "revarch", name: "Reverse Engineering", mascot: "ghost",
    focus: "Static and dynamic analysis of binaries and malware in a sandbox.",
    tools: ["ghidra", "radare2", "gdb", "strings"],
    examples: ["What does this binary do?", "Find the license check function", "Explain this assembly snippet"] },
  { id: "webclone", name: "Web Recon & Mirror", mascot: "cube",
    focus: "Mirror and archive an in-scope site for offline analysis. Not for phishing.",
    tools: ["wget mirror", "playwright", "diff"],
    examples: ["Mirror this in-scope site for analysis", "List technologies and endpoints", "Diff two versions of the page"] },
  { id: "appsec", name: "AppSec / Code", mascot: "cube",
    focus: "Code review, SAST and supply chain.",
    tools: ["semgrep", "git", "SCA", "grep"],
    examples: ["Find vulns in this repo", "Does this dependency have a CVE?", "Suggest a fix for this injection"] },
  { id: "blue", name: "Blue Team", mascot: "ghost",
    focus: "Detection, hardening and rules: Sigma, YARA and log analysis.",
    tools: ["sigma", "yara", "jq", "logs"],
    examples: ["Write a Sigma rule for this behavior", "Analyze this access log", "How do I harden this service?"] },
  { id: "cripto", name: "Crypto & CTF", mascot: "cube",
    focus: "CTF challenges: crypto, stego and forensics.",
    tools: ["python", "binwalk", "hashcat", "sage"],
    examples: ["Solve this crypto challenge", "What's hidden in this image?", "Crack this hash (lab)"] },
];
