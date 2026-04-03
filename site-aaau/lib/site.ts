export const siteConfig = {
  name: "AAAU Uniritter",
  description:
    "Plataforma oficial da Associacao Atletica Academica Uniritter com foco em marca, comunidade e venda de produtos.",
  url: "https://aaau-uniritter.vercel.app",
  policyNote:
    "Apos a compra, a gestao entra em contato pelo WhatsApp em ate 2 dias para confirmar entrega ou retirada.",
  nav: [
    { label: "Home", href: "/" },
    { label: "Produtos", href: "/produtos" },
    { label: "Gestao", href: "/#gestao" },
    { label: "Admin", href: "/admin/login" },
  ],
  adminLinks: [
    { label: "Visao Geral", href: "/admin" },
    { label: "Gestao", href: "/admin/gestao" },
    { label: "Produtos", href: "/admin/produtos" },
    { label: "Cupons", href: "/admin/cupons" },
    { label: "Pedidos", href: "/admin/pedidos" },
  ],
  categoryLabels: {
    APPAREL: "Lifestyle",
    UNIFORM: "Uniformes",
    ACCESSORY: "Acessorios",
  },
};

export const contactInfo = {
  instagram: "@aaau.uniritter",
  whatsapp: "(51) 99999-0000",
  email: "contato@aaauuniritter.com.br",
};
