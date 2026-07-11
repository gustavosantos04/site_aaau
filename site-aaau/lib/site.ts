const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://aaau-uniritter.vercel.app";

export const siteConfig = {
  name: "AAAU Uniritter",
  description:
    "Plataforma oficial da Associação Atlética Acadêmica Uniritter com foco em marca, comunidade e venda de produtos.",
  url: siteUrl,
  policyNote:
    "Após a compra, a gestão entra em contato pelo WhatsApp em até 2 dias para confirmar entrega ou retirada.",
  nav: [
    { label: "Home", href: "/" },
    { label: "Eventos", href: "/eventos" },
    { label: "Produtos", href: "/produtos" },
    { label: "Gestão", href: "/#gestao" },
  ],
  adminLinks: [
    { label: "Visão Geral", href: "/admin" },
    { label: "Eventos", href: "/admin/eventos" },
    { label: "Gestão", href: "/admin/gestao" },
    { label: "Produtos", href: "/admin/produtos" },
    { label: "Cupons", href: "/admin/cupons" },
    { label: "Pedidos", href: "/admin/pedidos" },
  ],
  categoryLabels: {
    APPAREL: "Lifestyle",
    UNIFORM: "Uniformes",
    ACCESSORY: "Acessórios",
  },
};

export const contactInfo = {
  instagram: "@atleticauniritter",
  whatsapp: "51 997565330",
};
