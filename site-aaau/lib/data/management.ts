export type ManagementMember = {
  name: string;
  role?: string;
  image?: string;
};

export type ManagementArea = {
  id: string;
  title: string;
  description: string;
  symbol: string;
  icon: "trophy" | "crown" | "megaphone" | "calendar" | "handshake" | "scale";
  accent: string;
  motto: string;
  members: ManagementMember[];
  palette: {
    glow: string;
    edge: string;
    veil: string;
  };
};

export const managementAreas: ManagementArea[] = [
  {
    id: "esportivo",
    title: "Esportivo",
    description:
      "Coordena treinos, comiss\u00f5es t\u00e9cnicas, calend\u00e1rio competitivo e a opera\u00e7\u00e3o que faz a AAAU entrar em quadra com consist\u00eancia.",
    symbol: "K",
    icon: "trophy",
    accent: "Performance em dia de jogo",
    motto: "Treino, leitura tatica e presenca competitiva.",
    members: [
      { name: "Rafael Bueno", role: "Diretor esportivo" },
      { name: "Bianca Furtado", role: "Coordenadora de modalidades" },
      { name: "Vitor Nunes", role: "Logistica de jogos" },
      { name: "Amanda Leite", role: "Relacionamento com atletas" },
    ],
    palette: {
      glow: "rgba(182, 42, 68, 0.44)",
      edge: "rgba(246, 228, 214, 0.22)",
      veil: "rgba(98, 15, 33, 0.58)",
    },
  },
  {
    id: "presidencia",
    title: "Presidencia",
    description:
      "Lidera a dire\u00e7\u00e3o estrat\u00e9gica da atl\u00e9tica, conecta as frentes internas e define o ritmo institucional da gest\u00e3o.",
    symbol: "A",
    icon: "crown",
    accent: "Visao, alinhamento e direcao",
    motto: "A carta que segura o centro do baralho.",
    members: [
      { name: "Lucas Dornelles", role: "Presidente" },
      { name: "Marina Lopes", role: "Vice-presidente" },
      { name: "Enzo Martins", role: "Chief of staff" },
    ],
    palette: {
      glow: "rgba(218, 192, 118, 0.24)",
      edge: "rgba(255, 245, 210, 0.28)",
      veil: "rgba(90, 58, 10, 0.4)",
    },
  },
  {
    id: "marketing",
    title: "Marketing",
    description:
      "Desenha campanhas, linguagem visual e ativa\u00e7\u00f5es para transformar a AAAU em marca memor\u00e1vel dentro e fora do campus.",
    symbol: "Q",
    icon: "megaphone",
    accent: "Narrativa, impacto e assinatura visual",
    motto: "Cada lancamento precisa parecer acontecimento.",
    members: [
      { name: "Giovana Reis", role: "Diretora de marketing" },
      { name: "Pedro Araujo", role: "Social media" },
      { name: "Laura Pacheco", role: "Direcao de arte" },
      { name: "Matheus Teles", role: "Conteudo audiovisual" },
      { name: "Clara Mello", role: "Copy e planejamento" },
    ],
    palette: {
      glow: "rgba(147, 28, 86, 0.36)",
      edge: "rgba(255, 225, 241, 0.18)",
      veil: "rgba(87, 15, 44, 0.58)",
    },
  },
  {
    id: "eventos",
    title: "Eventos",
    description:
      "Orquestra experiencias presenciais, integra calouros, ativa a torcida e cria os momentos que fazem a comunidade lembrar da AAAU.",
    symbol: "J",
    icon: "calendar",
    accent: "Ritmo de campus e energia de encontro",
    motto: "Quando a casa lota, a marca ganha memoria.",
    members: [
      { name: "Fernanda Silveira", role: "Diretora de eventos" },
      { name: "Caio Cardoso", role: "Operacao e fornecedores" },
      { name: "Isadora Costa", role: "Experiencia de publico" },
      { name: "Bruno Sampaio", role: "Apoio de producao" },
    ],
    palette: {
      glow: "rgba(214, 88, 44, 0.3)",
      edge: "rgba(255, 223, 206, 0.2)",
      veil: "rgba(90, 28, 10, 0.48)",
    },
  },
  {
    id: "comercial",
    title: "Comercial",
    description:
      "Abre parcerias, negocia contrapartidas, sustenta patrocinios e transforma relacionamento em receita para a atl\u00e9tica.",
    symbol: "10",
    icon: "handshake",
    accent: "Parceria com valor de marca",
    motto: "Conexao certa financia calendario, produto e presenca.",
    members: [
      { name: "Henrique Alves", role: "Diretor comercial" },
      { name: "Sofia Ramos", role: "Parcerias e patrocinio" },
      { name: "Davi Freitas", role: "Prospeccao" },
    ],
    palette: {
      glow: "rgba(80, 110, 186, 0.22)",
      edge: "rgba(228, 236, 255, 0.18)",
      veil: "rgba(18, 32, 74, 0.38)",
    },
  },
  {
    id: "juridico",
    title: "Juridico",
    description:
      "Cuida de contratos, autorizacoes, compliance e suporte documental para dar seguranca a cada movimento da gestao.",
    symbol: "9",
    icon: "scale",
    accent: "Seguranca institucional e clareza operacional",
    motto: "Estrutura solida para a gestao correr sem ruido.",
    members: [
      { name: "Natalia Medeiros", role: "Diretora juridica" },
      { name: "Thiago Barreto", role: "Contratos e compliance" },
    ],
    palette: {
      glow: "rgba(165, 181, 212, 0.18)",
      edge: "rgba(237, 239, 244, 0.22)",
      veil: "rgba(38, 44, 61, 0.52)",
    },
  },
];
