const labels: Record<string, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  SALES_OPEN: "Vendas abertas",
  SOLD_OUT: "Esgotado",
  FINISHED: "Encerrado",
  CANCELED: "Cancelado",
  PENDING: "Aguardando pagamento",
  PAID: "Pagamento confirmado",
  FAILED: "Falhou",
  REFUNDED: "Reembolsado",
  EXPIRED: "Prazo expirado",
  NOT_CREATED: "Ainda não iniciada",
  CREATING: "Sendo criada",
  CREATED: "Criada com sucesso",
  AMBIGUOUS: "Precisa de verificação",
  NOT_SENT: "Aguardando envio",
  SENDING: "Enviando agora",
  SENT: "E-mail enviado",
  VALID: "Válido",
  USED: "Entrada confirmada",
  ATHLETIC: "Atlética",
  PARTNER: "Parceiro",
  PROMOTION: "Promoção",
  OTHER: "Outro",
  CHECKED_IN: "Entrada confirmada",
  ALREADY_USED: "Ingresso já utilizado",
  INVALID: "Ingresso inválido",
  WRONG_EVENT: "Ingresso de outro evento",
  UNAUTHORIZED: "Acesso não autorizado",
  REVERSED: "Entrada desfeita",
  INATIVO: "Desativado",
  ESGOTADO: "Esgotado",
  FUTURO: "Abre futuramente",
  ENCERRADO: "Vendas encerradas",
  ATIVO: "Disponível agora",
};

export function adminStatusLabel(status?: string | null) {
  if (!status) return "Não informado";
  return labels[status] ?? status.toLowerCase().replaceAll("_", " ");
}

const emailLabels: Record<string, string> = {
  NOT_SENT: "Aguardando envio",
  PENDING: "Aguardando envio",
  SENDING: "Enviando agora",
  SENT: "Enviado ao provedor",
  DELIVERED: "Entregue ao destinatário",
  DELAYED: "Entrega atrasada",
  BOUNCED: "Recusado pelo servidor de e-mail",
  FAILED: "Falha no envio",
  COMPLAINED: "Marcado como spam",
  SUPPRESSED: "Bloqueado para proteção",
  AMBIGUOUS: "Precisa de verificação",
};

export function emailDeliveryStatusLabel(status?: string | null) {
  if (!status) return "Sem registro de envio";
  return emailLabels[status] ?? adminStatusLabel(status);
}
