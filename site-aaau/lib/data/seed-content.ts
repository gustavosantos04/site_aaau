import type {
  Coupon,
  EventItem,
  OrderData,
  Product,
} from "@/types/store";

export const featuredStats = [
  { label: "anos de história", value: "12+" },
  { label: "modalidades", value: "5" },
  { label: "campi ativos", value: "3" },
  { label: "títulos recentes", value: "4" },
];

export const aboutKeywords = [
  "Raca",
  "Tradicao",
  "Comunidade",
  "Torcida",
  "Jogos",
  "Campus",
];

export const aboutHighlights = [
  {
    label: "Presenca",
    value: "Marca que entra em quadra",
  },
  {
    label: "Ritual",
    value: "Do grito no campus ao dia de jogo",
  },
  {
    label: "Comunidade",
    value: "Atletas, torcida e gestao em um so pulso",
  },
];

export const aboutPillars = [
  {
    eyebrow: "Identidade",
    title: "Camisa, voz e assinatura visual",
    description:
      "A AAAU transforma presenca em simbolo: cores, escudo, linguagem e atitude trabalhando como uma mesma equipe.",
  },
  {
    eyebrow: "Comunidade",
    title: "Gente que joga, organiza e lota a arquibancada",
    description:
      "A experiencia da atletica ganha forca quando alunos, atletas, calouros e gestao sentem que fazem parte do mesmo capitulo.",
  },
  {
    eyebrow: "Jogo",
    title: "Energia competitiva com leitura premium",
    description:
      "Treino, evento, recepcao e drop oficial compartilham a mesma direcao: impacto visual, clareza e memoria de marca.",
  },
];

export const historyTimeline = [
  {
    year: "2014",
    chapter: "Origem",
    title: "Nasce o grito da AAAU",
    description:
      "A atletica nasce para unir campus, identidade e competitividade sob o mesmo escudo.",
    image: "/images/hero/campus-crowd.svg",
    imageAlt: "Torcida e campus representando o inicio da AAAU",
    caption: "Campus, torcida e vontade de competir passam a falar a mesma lingua.",
  },
  {
    year: "2016",
    chapter: "Primeiros jogos",
    title: "As quadras passam a ter dono",
    description:
      "Treinos e jogos recorrentes colocam a AAAU no ritmo esportivo da universidade.",
    image: "/images/mascots/bull_futsal.png",
    imageAlt: "Mascote de futsal representando a entrada da AAAU nas competicoes",
    caption: "O uniforme ganha peso e a arquibancada comeca a reconhecer sua voz.",
  },
  {
    year: "2019",
    chapter: "Expansao",
    title: "As modalidades ganham corpo",
    description:
      "As modalidades ampliam a presenca da atletica dentro e fora dos dias de competicao.",
    image: "/images/mascots/bull_volei.png",
    imageAlt: "Mascote da AAAU representando a expansao das modalidades",
    caption: "A AAAU deixa de ser um nucleo isolado e vira ecossistema esportivo.",
  },
  {
    year: "2023",
    chapter: "Marca viva",
    title: "A marca vira ponto de encontro",
    description:
      "Eventos e comunicacao passam a reforcar a forma como a comunidade reconhece a AAAU.",
    image: "/images/brand/event-integration.svg",
    imageAlt: "Evento universitario representando a marca da AAAU como ponto de encontro",
    caption: "A atletica passa a criar memoria de campus com linguagem propria.",
  },
  {
    year: "2026",
    chapter: "Nova fase",
    title: "Historia, produto e digital se alinham",
    description:
      "A nova casa digital conecta narrativa, experiencia mobile-first e vendas.",
    image: "/images/hero/arena-lights.svg",
    imageAlt: "Luzes de arena representando a nova fase premium da AAAU",
    caption: "A trajetoria vira experiencia visual e prepara a entrada na proxima fase.",
  },
];

export const achievements = [
  "Campeão Uni",
  "Campeão Futsal Masculino IA",
  "Campeão Vôlei Feminino IA",
  "Campeão Geral IA 2025",
];

export const sports = [
  "Futsal",
  "Vôlei",
  "Handebol",
  "Basquete",
  "Fut7",
];

export const managementGroups = [
  {
    name: "Esportivo",
    description:
      "Coordena treinos, escalações, uniformes de jogo e a operação das equipes ao longo do semestre.",
  },
  {
    name: "Marketing",
    description:
      "Cria campanhas, dirige a identidade visual e transforma cada lançamento em ativo de marca.",
  },
  {
    name: "Jurídico",
    description:
      "Organiza contratos, autorizações e suporte documental para eventos, produtos e patrocínios.",
  },
  {
    name: "Comercial",
    description:
      "Desenvolve parcerias, ativa patrocinadores e amplia as receitas que sustentam o calendário da atlética.",
  },
];

export const sponsors = ["Titanium Agency Legacy", "Eletroser"];
export const campuses = ["Zona Sul", "FAPA", "Canoas"];

export const eventsSeed: EventItem[] = [
  {
    id: "event-opener",
    title: "Lançamento da Coleção AAAU 2026",
    slug: "lancamento-colecao-aaau-2026",
    excerpt:
      "Drop inaugural da nova fase da atlética com ativação de marca, fotos oficiais e abertura de pedidos.",
    startsAt: "2026-04-12T19:30:00.000Z",
    location: "Campus Zona Sul",
    coverImage: "/images/brand/event-launch.svg",
    isFeatured: true,
    isActive: true,
  },
  {
    id: "event-cup",
    title: "Semana de Integração AAAU",
    slug: "semana-integracao-aaau",
    excerpt:
      "Agenda de amistosos, seletivas e recepção de calouros conectando esporte e comunidade.",
    startsAt: "2026-05-05T18:00:00.000Z",
    location: "FAPA",
    coverImage: "/images/brand/event-integration.svg",
    isFeatured: false,
    isActive: true,
  },
];

export const productsSeed: Product[] = [
  {
    id: "product-basic",
    name: "Camiseta AAAU Basic",
    slug: "camiseta-aaau-basic",
    price: 69.9,
    description:
      "Modelagem universitária premium com base bordô, assinatura frontal minimalista e conforto para rotina e arquibancada.",
    category: "APPAREL",
    sizes: ["P", "M", "G", "GG"],
    featured: true,
    isNew: true,
    isActive: true,
    images: [
      {
        id: "basic-1",
        url: "/images/products/basic-front.svg",
        alt: "Camiseta AAAU Basic em composição frontal",
        isPrimary: true,
        sortOrder: 1,
      },
      {
        id: "basic-2",
        url: "/images/products/basic-detail.svg",
        alt: "Detalhe premium da Camiseta AAAU Basic",
        isPrimary: false,
        sortOrder: 2,
      },
    ],
  },
  {
    id: "product-uniform",
    name: "Uniforme de Jogo",
    slug: "uniforme-de-jogo-aaau",
    price: 149.9,
    description:
      "Kit pensado para quadra e dia de jogo, com estética agressiva, brasão bulldog e linguagem de performance.",
    category: "UNIFORM",
    sizes: ["P", "M", "G", "GG"],
    featured: true,
    isNew: true,
    isActive: true,
    images: [
      {
        id: "uniform-1",
        url: "/images/products/uniform-front.svg",
        alt: "Uniforme de Jogo AAAU em destaque",
        isPrimary: true,
        sortOrder: 1,
      },
      {
        id: "uniform-2",
        url: "/images/products/uniform-detail.svg",
        alt: "Detalhe do uniforme de jogo com assinatura AAAU",
        isPrimary: false,
        sortOrder: 2,
      },
    ],
  },
  {
    id: "product-shorts",
    name: "Shorts AAAU",
    slug: "shorts-aaau",
    price: 79.9,
    description:
      "Short técnico leve para treinos, eventos e uso casual, com caimento esportivo e identidade visual limpa.",
    category: "APPAREL",
    sizes: ["P", "M", "G", "GG"],
    featured: false,
    isNew: true,
    isActive: true,
    images: [
      {
        id: "shorts-1",
        url: "/images/products/shorts-front.svg",
        alt: "Shorts AAAU em composição frontal",
        isPrimary: true,
        sortOrder: 1,
      },
      {
        id: "shorts-2",
        url: "/images/products/shorts-detail.svg",
        alt: "Detalhe do shorts AAAU",
        isPrimary: false,
        sortOrder: 2,
      },
    ],
  },
  {
    id: "product-mug",
    name: "Caneca AAAU",
    slug: "caneca-aaau",
    price: 39.9,
    description:
      "Peça utilitária de presença forte para rotina acadêmica, gestão e kits promocionais da atlética.",
    category: "ACCESSORY",
    sizes: ["Único"],
    featured: true,
    isNew: false,
    isActive: true,
    images: [
      {
        id: "mug-1",
        url: "/images/products/mug-front.svg",
        alt: "Caneca AAAU em composição premium",
        isPrimary: true,
        sortOrder: 1,
      },
      {
        id: "mug-2",
        url: "/images/products/mug-detail.svg",
        alt: "Detalhe da caneca AAAU",
        isPrimary: false,
        sortOrder: 2,
      },
    ],
  },
];

export const couponsSeed: Coupon[] = [
  {
    id: "coupon-gestao",
    code: "GESTAO",
    description: "Cupom institucional de lançamento para a gestão atual.",
    discountType: "PERCENTAGE",
    discountValue: 10,
    isActive: true,
  },
];

export const ordersSeed: OrderData[] = [
  {
    id: "order-1",
    orderNumber: "AAAU-2401",
    customerName: "Marina Costa",
    customerEmail: "marina@example.com",
    customerPhone: "(51) 99888-7766",
    status: "CONTACT_PENDING",
    subtotal: 219.8,
    discount: 21.98,
    total: 197.82,
    notes: "Entrega no campus Zona Sul.",
    createdAt: "2026-03-18T19:30:00.000Z",
    items: [
      {
        id: "order-item-1",
        productId: "product-uniform",
        productName: "Uniforme de Jogo",
        productSlug: "uniforme-de-jogo-aaau",
        size: "M",
        quantity: 1,
        unitPrice: 149.9,
        lineTotal: 149.9,
      },
      {
        id: "order-item-2",
        productId: "product-basic",
        productName: "Camiseta AAAU Basic",
        productSlug: "camiseta-aaau-basic",
        size: "G",
        quantity: 1,
        unitPrice: 69.9,
        lineTotal: 69.9,
      },
    ],
  },
];

export const adminUsersSeed = [
  {
    id: "admin-main",
    name: "Gestão AAAU",
    email: "admin@aaauuniritter.com.br",
    passwordHash: "dev_only_hash",
    role: "ADMIN",
    isActive: true,
  },
];
