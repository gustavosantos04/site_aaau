import type { Coupon, EventItem, OrderData, Product } from "@/types/store";

export const featuredStats = [
  { label: "anos de história", value: "12+" },
  { label: "modalidades", value: "6" },
  { label: "campi ativos", value: "3" },
];

export const aboutKeywords = ["Raça", "Tradição", "Comunidade", "Torcida", "Jogos", "Campus"];

export const aboutHighlights = [
  {
    label: "Presença",
    value: "Marca que entra em quadra",
  },
  {
    label: "Ritual",
    value: "Do grito no campus ao dia de jogo",
  },
  {
    label: "Comunidade",
    value: "Atletas, torcida e gestão em um só pulso",
  },
];

export const aboutPillars = [
  {
    eyebrow: "Identidade",
    title: "Camisa, voz e assinatura visual",
    description:
      "A AAAU transforma presença em símbolo: cores, escudo, linguagem e atitude trabalhando como uma mesma equipe.",
  },
  {
    eyebrow: "Comunidade",
    title: "Gente que joga, organiza e lota a arquibancada",
    description:
      "A experiência da atlética ganha força quando alunos, atletas, calouros e gestão sentem que fazem parte do mesmo capítulo.",
  },
  {
    eyebrow: "Jogo",
    title: "Energia competitiva com leitura premium",
    description:
      "Treino, evento, recepção e drop oficial compartilham a mesma direção: impacto visual, clareza e memória de marca.",
  },
];

export const historyTimeline = [
  {
    year: "2014",
    chapter: "Origem",
    title: "Nasce o grito da AAAU",
    description:
      "A atlética nasce para unir campus, identidade e competitividade sob o mesmo escudo.",
    image: "/images/hero/campus-crowd.svg",
    imageAlt: "Torcida e campus representando o início da AAAU",
    caption: "Campus, torcida e vontade de competir passam a falar a mesma língua.",
  },
  {
    year: "2016",
    chapter: "Primeiros jogos",
    title: "As quadras passam a ter dono",
    description:
      "Treinos e jogos recorrentes colocam a AAAU no ritmo esportivo da universidade.",
    image: "/images/mascots/bull_futsal.png",
    imageAlt: "Mascote de futsal representando a entrada da AAAU nas competições",
    caption: "O uniforme ganha peso e a arquibancada começa a reconhecer sua voz.",
  },
  {
    year: "2019",
    chapter: "Expansão",
    title: "As modalidades ganham corpo",
    description:
      "As modalidades ampliam a presença da atlética dentro e fora dos dias de competição.",
    image: "/images/mascots/bull_volei.png",
    imageAlt: "Mascote da AAAU representando a expansão das modalidades",
    caption: "A AAAU deixa de ser um núcleo isolado e vira ecossistema esportivo.",
  },
  {
    year: "2023",
    chapter: "Marca viva",
    title: "A marca vira ponto de encontro",
    description:
      "Eventos e comunicação passam a reforçar a forma como a comunidade reconhece a AAAU.",
    image: "/images/brand/event-integration.svg",
    imageAlt: "Evento universitário representando a marca da AAAU como ponto de encontro",
    caption: "A atlética passa a criar memória de campus com linguagem própria.",
  },
  {
    year: "2026",
    chapter: "Nova fase",
    title: "História, produto e digital se alinham",
    description:
      "A nova casa digital conecta narrativa, experiência mobile-first e vendas.",
    image: "/images/hero/arena-lights.svg",
    imageAlt: "Luzes de arena representando a nova fase premium da AAAU",
    caption: "A trajetória vira experiência visual e prepara a entrada na próxima fase.",
  },
];

export const achievements = [
  {
    title: "Campeão Divisão de Acesso IA",
    year: "2025",
    image: "/images/conquistas/ia_2025.jpeg",
    imageAlt: "Atletas da AAAU celebrando o título da Divisão de Acesso IA 2025",
  },
  {
    title: "UNI Divisão de Acesso",
    year: "2025",
    image: "/images/conquistas/uni_2025.jpeg",
    imageAlt: "Equipe da AAAU comemorando o título UNI Divisão de Acesso 2025",
  },
];

export const sports = ["Futsal", "Vôlei", "Handebol", "Basquete", "Fut7", "Futvôlei"];

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
    name: "Jurídico/Financeiro",
    description:
      "Organiza contratos, financeiro, autorizações e suporte documental para eventos, produtos e patrocínios.",
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

const apparelSizeColumns = ["PP", "P", "M", "G", "GG", "EG", "G1", "G2", "G3", "G4"];
const uniformSizeColumns = ["P", "M", "G", "GG", "EG", "EGG2", "EGG3"];
const basicSizeColumns = ["P", "M", "G", "GG", "XG"];

const tiranteColorOption = {
  id: "tirante-color",
  label: "Cor do tirante",
  required: true,
  values: [
    { id: "preto", label: "Preto", swatch: "#111111" },
    { id: "bordo", label: "Bordo", swatch: "#7b1023" },
  ],
};

const croppedColorOption = {
  id: "cropped-color",
  label: "Cor do cropped",
  required: true,
  values: [
    { id: "bordo", label: "Bordo", swatch: "#7b1023" },
    { id: "preto", label: "Preto", swatch: "#111111" },
    { id: "branco", label: "Branco", swatch: "#f2f0eb" },
  ],
};

const measurementNote =
  "Medidas em centímetros, com a peça colocada em mesa plana, sem esticar. Use uma peça que vista bem como referência. Margem aproximada de tolerância: +/- 1 cm.";

const apparelMetrics = [
  { label: "A", description: "Altura da peça" },
  { label: "B", description: "Largura do peito" },
  { label: "C", description: "Comprimento da manga" },
];

const uniformMetrics = [
  { label: "Altura", description: "Comprimento da gola ate a barra" },
  { label: "Largura", description: "Medida frontal de um lado ao outro" },
  { label: "Tora", description: "Circunferencia aproximada" },
  { label: "Ombro", description: "Largura de ombro" },
  { label: "M. curta", description: "Comprimento da manga curta" },
];

const fallbackMeasurementGuide = {
  title: "Guia de medidas aproximado",
  note:
    "Tabela aproximada baseada nos fornecedores da coleção. Compare com uma peça sua antes de escolher o tamanho.",
  metrics: [
    { label: "Altura", description: "Comprimento da gola ate a barra" },
    { label: "Largura", description: "Medida frontal de um lado ao outro" },
  ],
  tables: [
    {
      id: "aproximado-unissex",
      title: "Unissex",
      columns: basicSizeColumns,
      rows: [
        { label: "Altura", values: [67, 69, 71, 73, 75] },
        { label: "Largura", values: [48, 51, 54, 58, 62] },
      ],
    },
  ],
};

const cortaVentoMeasurementGuide = {
  title: "Guia de medidas do corta vento",
  note: measurementNote,
  metrics: apparelMetrics,
  tables: [
    {
      id: "corta-vento-masculino",
      title: "Masculino",
      columns: apparelSizeColumns,
      rows: [
        { label: "A", values: [72, 73, 75, 76, 78, 80, 82, 84, 86, 87] },
        { label: "B", values: [52, 54, 57, 59, 62, 65, 67, 69, 71, 73] },
        { label: "C", values: [67, 68, 69, 71, 72, 74, 76, 78, 78, 80] },
      ],
    },
    {
      id: "corta-vento-feminino",
      title: "Feminino",
      columns: apparelSizeColumns,
      rows: [
        { label: "A", values: [66, 67, 68, 70, 72, 74, 76, 78, 78, 80] },
        { label: "B", values: [48, 50, 52, 54, 56, 58, 60, 62, 64, 66] },
        { label: "C", values: [63, 64, 65, 67, 69, 70, 72, 74, 74, 76] },
      ],
    },
  ],
};

const moletomMeasurementGuide = {
  title: "Guia de medidas do moletom",
  note: measurementNote,
  metrics: apparelMetrics,
  tables: [
    {
      id: "moletom-masculino",
      title: "Masculino",
      columns: apparelSizeColumns,
      rows: [
        { label: "A", values: [74, 76, 78, 80, 82, 84, 86, 88, 90, 92] },
        { label: "B", values: [54, 57, 60, 63, 66, 69, 72, 75, 78, 80] },
        { label: "C", values: [66, 67, 68, 69, 70, 71, 71, 72, 72, 72] },
      ],
    },
    {
      id: "moletom-feminino",
      title: "Feminino",
      columns: apparelSizeColumns,
      rows: [
        { label: "A", values: [67, 69, 71, 73, 75, 77, 79, 81, 83, 85] },
        { label: "B", values: [48, 51, 54, 57, 60, 63, 66, 69, 72, 75] },
        { label: "C", values: [60, 61, 62, 63, 64, 65, 65, 66, 66, 67] },
      ],
    },
  ],
};

const jaquetaMeasurementGuide = {
  title: "Guia de medidas da jaqueta",
  note: measurementNote,
  metrics: apparelMetrics,
  tables: [
    {
      id: "jaqueta-masculino",
      title: "Masculino",
      columns: apparelSizeColumns,
      rows: [
        { label: "A", values: [67, 69, 71, 73, 75, 77, 79, 81, 83, 85] },
        { label: "B", values: [54, 57, 60, 63, 66, 69, 72, 75, 78, 81] },
        { label: "C", values: [65, 66, 67, 68, 69, 70, 71, 72, 72, 73] },
      ],
    },
    {
      id: "jaqueta-feminino",
      title: "Feminino",
      columns: apparelSizeColumns,
      rows: [
        { label: "A", values: [62, 64, 66, 68, 70, 72, 74, 76, 78, 80] },
        { label: "B", values: [47, 50, 53, 56, 59, 62, 65, 68, 71, 74] },
        { label: "C", values: [59, 60, 61, 62, 63, 64, 65, 65, 66, 66] },
      ],
    },
  ],
};

const uniformBordoMeasurementGuide = {
  title: "Guia de medidas do uniforme bordo",
  note: "Medidas em centímetros para camiseta tradicional e baby long. Compare com uma camiseta sua antes de escolher.",
  metrics: [
    { label: "Altura", description: "Comprimento da gola ate a barra" },
    { label: "Largura", description: "Medida frontal de um lado ao outro" },
    { label: "Busto", description: "Medida frontal do busto no modelo baby long" },
    { label: "Cintura", description: "Medida frontal da cintura no modelo baby long" },
  ],
  tables: [
    {
      id: "uniforme-bordo-tradicional",
      title: "Tradicional",
      columns: ["PP", "P", "M", "G", "GG", "XG"],
      rows: [
        { label: "Altura", values: [55, 59, 65, 69, 73, 77] },
        { label: "Largura", values: [48, 51, 54, 58, 62, 67] },
      ],
    },
    {
      id: "uniforme-bordo-baby-long",
      title: "Baby long",
      columns: ["P", "M", "G", "GG"],
      rows: [
        { label: "Altura", values: [56, 60, 64, 68] },
        { label: "Busto", values: [40, 44, 48, 52] },
        { label: "Cintura", values: [43, 47, 51, 55] },
      ],
    },
  ],
};

const uniformBrancoMeasurementGuide = {
  title: "Guia de medidas do uniforme branco",
  note: "Medidas em centímetros da camiseta drysoft sublimada.",
  metrics: uniformMetrics,
  tables: [
    {
      id: "uniforme-branco-camiseta",
      title: "Camiseta drysoft sublimada",
      columns: uniformSizeColumns,
      rows: [
        { label: "Altura", values: [67, 70, 73, 76, 79, 82, 85] },
        { label: "Tora", values: [104, 108, 112, 116, 122, 126, 130] },
        { label: "Largura", values: [52, 54, 56, 58, 61, 63, 65] },
        { label: "Ombro", values: [13, 14, 15, 16, 17, 17, 18] },
        { label: "M. curta", values: [20, 20, 21, 23, 25, 26, 27] },
      ],
    },
  ],
};

export const productsSeed: Product[] = [
  {
    id: "product-corta-vento",
    name: "Corta Vento",
    slug: "corta-vento",
    price: 165,
    description:
      "Corta vento oficial AAAU para dias de jogo, campus e rotina, com identidade da atlética em destaque.",
    category: "APPAREL",
    sizes: apparelSizeColumns,
    stock: 40,
    requiresCustomization: false,
    featured: true,
    isNew: true,
    isActive: true,
    images: [
      {
        id: "corta-vento-1",
        url: "/images/products/CORTA VENTO.jpg",
        alt: "Corta Vento AAAU",
        isPrimary: true,
        sortOrder: 1,
      },
    ],
    measurementGuide: cortaVentoMeasurementGuide,
  },
  {
    id: "product-caneca",
    name: "Caneca",
    slug: "caneca",
    price: 35,
    description:
      "Caneca oficial AAAU para acompanhar a rotina de aula, treino e eventos da atlética.",
    category: "ACCESSORY",
    sizes: ["Único"],
    stock: 50,
    requiresCustomization: false,
    featured: true,
    isNew: true,
    isActive: true,
    images: [
      {
        id: "caneca-1",
        url: "/images/products/Caneca AAAU - Mota.jpeg",
        alt: "Caneca AAAU",
        isPrimary: true,
        sortOrder: 1,
      },
    ],
  },
  {
    id: "product-caneca-tirante",
    name: "Caneca + Tirante",
    slug: "caneca-tirante",
    price: 35,
    description: "Escolha so a caneca oficial ou o combo com tirante para montar o kit da torcida.",
    category: "ACCESSORY",
    sizes: ["Único"],
    stock: 50,
    requiresCustomization: false,
    featured: false,
    isNew: true,
    isActive: true,
    variants: [
      {
        id: "caneca",
        label: "So caneca",
        price: 35,
        description: "Caneca oficial AAAU.",
      },
      {
        id: "combo",
        label: "Caneca + tirante",
        price: 40,
        description: "Caneca oficial com tirante na cor escolhida.",
        requiredOptionIds: ["tirante-color"],
      },
    ],
    options: [tiranteColorOption],
    images: [
      {
        id: "caneca-tirante-1",
        url: "/images/products/Caneca AAAU - Mota.jpeg",
        alt: "Caneca AAAU",
        isPrimary: true,
        sortOrder: 1,
      },
      {
        id: "caneca-tirante-2",
        url: "/images/products/TIRANTE 1.1.png",
        alt: "Tirante AAAU",
        isPrimary: false,
        sortOrder: 2,
      },
    ],
  },
  {
    id: "product-tirante",
    name: "Tirante",
    slug: "tirante",
    price: 10,
    description: "Tirante oficial AAAU para credencial, chaveiro e eventos da atlética.",
    category: "ACCESSORY",
    sizes: ["Único"],
    stock: 80,
    requiresCustomization: false,
    featured: false,
    isNew: true,
    isActive: true,
    options: [tiranteColorOption],
    images: [
      {
        id: "tirante-1",
        url: "/images/products/TIRANTE 1.1.png",
        alt: "Tirante AAAU",
        isPrimary: true,
        sortOrder: 1,
      },
    ],
  },
  {
    id: "product-jaqueta-college",
    name: "Jaqueta College",
    slug: "jaqueta-college",
    price: 200,
    description: "Jaqueta college AAAU com escolha de número para personalizar a peça.",
    category: "APPAREL",
    sizes: apparelSizeColumns,
    stock: 30,
    requiresCustomization: false,
    featured: true,
    isNew: true,
    isActive: true,
    images: [
      {
        id: "jaqueta-college-1",
        url: "/images/products/BOMBER JACKET (2).png",
        alt: "Jaqueta College AAAU",
        isPrimary: true,
        sortOrder: 1,
      },
    ],
    measurementGuide: jaquetaMeasurementGuide,
  },
  {
    id: "product-cropped",
    name: "Cropped",
    slug: "cropped",
    price: 55,
    description: "Cropped AAAU com caimento casual para usar no campus, nos jogos e nos eventos.",
    category: "APPAREL",
    sizes: ["P", "M", "G", "GG"],
    stock: 40,
    requiresCustomization: false,
    featured: false,
    isNew: true,
    isActive: true,
    options: [croppedColorOption],
    images: [
      {
        id: "cropped-1",
        url: "/images/products/CROPPED.jpg",
        alt: "Cropped AAAU",
        isPrimary: true,
        sortOrder: 1,
      },
    ],
    measurementGuide: fallbackMeasurementGuide,
  },
  {
    id: "product-jersey-nfl",
    name: "Jersey NFL",
    slug: "jersey-nfl",
    price: 180,
    description: "Jersey modelo NFL com nome e número personalizados.",
    category: "UNIFORM",
    sizes: ["P", "M", "G", "GG", "XG"],
    stock: 30,
    requiresCustomization: true,
    featured: true,
    isNew: true,
    isActive: true,
    images: [
      {
        id: "jersey-nfl-1",
        url: "/images/products/JERSEY AAAU4.png",
        alt: "Jersey NFL AAAU",
        isPrimary: true,
        sortOrder: 1,
      },
    ],
    measurementGuide: fallbackMeasurementGuide,
  },
  {
    id: "product-jersey-tradicional",
    name: "Jersey Tradicional",
    slug: "jersey-tradicional",
    price: 100,
    description: "Jersey tradicional AAAU com nome e número personalizados.",
    category: "UNIFORM",
    sizes: ["P", "M", "G", "GG", "XG"],
    stock: 30,
    requiresCustomization: true,
    featured: false,
    isNew: true,
    isActive: true,
    images: [
      {
        id: "jersey-tradicional-1",
        url: "/images/products/1.1 - BORDO E PRETO.png",
        alt: "Jersey Tradicional AAAU",
        isPrimary: true,
        sortOrder: 1,
      },
    ],
    measurementGuide: fallbackMeasurementGuide,
  },
  {
    id: "product-uniforme-bordo",
    name: "Uniforme Bordo",
    slug: "uniforme-bordo",
    price: 75,
    description: "Uniforme bordo com nome e número personalizados. Escolha entre só camiseta ou conjunto completo.",
    category: "UNIFORM",
    sizes: ["PP", "P", "M", "G", "GG", "XG"],
    stock: 30,
    requiresCustomization: true,
    featured: false,
    isNew: true,
    isActive: true,
    variants: [
      {
        id: "camiseta",
        label: "Só camiseta",
        price: 75,
        description: "Camiseta bordo personalizada.",
      },
      {
        id: "completo",
        label: "Conjunto completo",
        price: 140,
        description: "Camiseta e short bordo personalizados.",
      },
    ],
    images: [
      {
        id: "uniforme-bordo-1",
        url: "/images/products/Uniforme Bordo 1.jpg",
        alt: "Uniforme Bordo AAAU",
        isPrimary: true,
        sortOrder: 1,
      },
    ],
    measurementGuide: uniformBordoMeasurementGuide,
  },
  {
    id: "product-uniforme-branco",
    name: "Uniforme Branco",
    slug: "uniforme-branco",
    price: 85,
    description: "Uniforme branco com nome e número personalizados. Escolha entre só camiseta ou conjunto completo.",
    category: "UNIFORM",
    sizes: uniformSizeColumns,
    stock: 30,
    requiresCustomization: true,
    featured: false,
    isNew: true,
    isActive: true,
    variants: [
      {
        id: "camiseta",
        label: "Só camiseta",
        price: 85,
        description: "Camiseta branca personalizada.",
      },
      {
        id: "completo",
        label: "Conjunto completo",
        price: 150,
        description: "Camiseta e short branco personalizados.",
      },
    ],
    images: [
      {
        id: "uniforme-branco-1",
        url: "/images/products/Uniforme Branco 2.jpg",
        alt: "Uniforme Branco AAAU",
        isPrimary: true,
        sortOrder: 1,
      },
    ],
    measurementGuide: uniformBrancoMeasurementGuide,
  },
  {
    id: "product-moletom",
    name: "Moletom",
    slug: "moletom",
    price: 200,
    description: "Moletom oficial AAAU para frio, arquibancada e rotina no campus.",
    category: "APPAREL",
    sizes: apparelSizeColumns,
    stock: 35,
    requiresCustomization: false,
    featured: true,
    isNew: true,
    isActive: true,
    images: [
      {
        id: "moletom-1",
        url: "/images/products/MOLETOM.png",
        alt: "Moletom AAAU",
        isPrimary: true,
        sortOrder: 1,
      },
    ],
    measurementGuide: moletomMeasurementGuide,
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
    subtotal: 225,
    discount: 22.5,
    total: 202.5,
    notes: "Entrega no campus Zona Sul.",
    createdAt: "2026-03-18T19:30:00.000Z",
    items: [
      {
        id: "order-item-1",
        productId: "product-uniforme-branco",
        productName: "Uniforme Branco - Conjunto completo",
        productSlug: "uniforme-branco",
        size: "M",
        customName: "MARINA",
        customNumber: "10",
        quantity: 1,
        unitPrice: 150,
        lineTotal: 150,
      },
      {
        id: "order-item-2",
        productId: "product-uniforme-bordo",
        productName: "Uniforme Bordo - Só camiseta",
        productSlug: "uniforme-bordo",
        size: "G",
        quantity: 1,
        unitPrice: 75,
        lineTotal: 75,
      },
    ],
  },
];

export const adminUsersSeed = [
  {
    id: "admin-main",
    name: "Gestão AAAU",
    email: "configure-admin-via-env@example.com",
    passwordHash: "env_managed_auth",
    role: "ADMIN",
    isActive: true,
  },
];
