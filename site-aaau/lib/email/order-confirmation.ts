import { EmailDeliveryKind } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getTransactionalEmailConfig, sendTrackedEmail } from "@/lib/email/delivery";
import { getConfiguredBaseUrl } from "@/lib/site-url";

type EmailItem = {
  productName: string;
  size: string | null;
  customName: string | null;
  customNumber: string | null;
  quantity: number;
  lineTotal: number;
  imageUrl: string | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getBaseUrl() {
  return getConfiguredBaseUrl();
}

function absoluteUrl(path: string | null) {
  if (!path) {
    return null;
  }

  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return `${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

function buildOrderText({
  orderNumber,
  customerName,
  total,
  items,
}: {
  orderNumber: string;
  customerName: string;
  total: number;
  items: EmailItem[];
}) {
  const itemLines = items
    .map((item) => {
      const details = [
        item.size ? `Tam ${item.size}` : null,
        item.customName ? `Nome ${item.customName}` : null,
        item.customNumber ? `Numero ${item.customNumber}` : null,
      ]
        .filter(Boolean)
        .join(" - ");

      return `- ${item.quantity}x ${item.productName}${details ? ` (${details})` : ""}: ${formatCurrency(item.lineTotal)}`;
    })
    .join("\n");

  return [
    `Ola, ${customerName.split(" ")[0] || "cliente"}.`,
    "",
    `Pagamento confirmado para o pedido ${orderNumber}.`,
    "",
    itemLines,
    "",
    `Total: ${formatCurrency(total)}`,
    "",
    "A gestao da AAAU vai entrar em contato para combinar a entrega ou retirada do pedido.",
  ].join("\n");
}

function buildItemsHtml(items: EmailItem[]) {
  return items
    .map((item) => {
      const image = absoluteUrl(item.imageUrl);
      const details = [
        item.size ? `Tam ${escapeHtml(item.size)}` : null,
        item.customName ? `Nome ${escapeHtml(item.customName)}` : null,
        item.customNumber ? `Numero ${escapeHtml(item.customNumber)}` : null,
      ]
        .filter(Boolean)
        .join(" &bull; ");

      return `
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid rgba(255,255,255,.12);">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tr>
                <td width="86" valign="top" style="width:86px;">
                  ${
                    image
                      ? `<img src="${image}" width="72" height="72" alt="${escapeHtml(item.productName)}" style="display:block;width:72px;height:72px;object-fit:cover;border-radius:12px;border:1px solid rgba(255,255,255,.16);" />`
                      : `<div style="width:72px;height:72px;border-radius:12px;background:#2a1118;"></div>`
                  }
                </td>
                <td valign="top" style="padding-left:14px;">
                  <div style="font-size:15px;font-weight:800;color:#ffffff;">${escapeHtml(item.productName)}</div>
                  ${details ? `<div style="margin-top:4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#c8b8bf;">${details}</div>` : ""}
                  <div style="margin-top:8px;font-size:13px;color:#c8b8bf;">${item.quantity} unidade${item.quantity > 1 ? "s" : ""}</div>
                </td>
                <td valign="top" align="right" style="font-size:15px;font-weight:800;color:#ffffff;white-space:nowrap;">
                  ${formatCurrency(item.lineTotal)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    })
    .join("");
}

function buildCustomerHtml({
  orderNumber,
  customerName,
  total,
  paidAt,
  items,
}: {
  orderNumber: string;
  customerName: string;
  total: number;
  paidAt: Date | null;
  items: EmailItem[];
}) {
  const baseUrl = getBaseUrl();
  const logoUrl = `${baseUrl}/images/brand/Logo%20AAAU%20PNG.png`;
  const mascotUrl = `${baseUrl}/images/mascots/bull_torcida.png`;

  return `
    <div style="margin:0;padding:0;background:#080607;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#080607;border-collapse:collapse;">
        <tr>
          <td align="center" style="padding:28px 12px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;border-collapse:collapse;background:#120d0f;border:1px solid rgba(255,255,255,.12);border-radius:18px;overflow:hidden;">
              <tr>
                <td style="padding:26px 28px;background:#7b1023;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td>
                        <img src="${logoUrl}" width="92" alt="AAAU" style="display:block;width:92px;height:auto;" />
                      </td>
                      <td align="right" style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#ffffff;">
                        Pedido aprovado
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:30px 28px 12px;font-family:Arial,sans-serif;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td valign="top">
                        <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#e3bd8f;font-weight:800;">Pagamento confirmado</div>
                        <h1 style="margin:10px 0 10px;font-size:30px;line-height:1.05;color:#ffffff;text-transform:uppercase;">Seu pedido entrou no jogo.</h1>
                        <p style="margin:0;font-size:15px;line-height:1.65;color:#ddd0d5;">Ola, ${escapeHtml(customerName.split(" ")[0] || "cliente")}. Recebemos a confirmacao do pagamento do pedido <strong style="color:#ffffff;">${escapeHtml(orderNumber)}</strong>.</p>
                      </td>
                      <td align="right" valign="bottom" width="138" style="width:138px;">
                        <img src="${mascotUrl}" width="118" alt="Mascote AAAU" style="display:block;width:118px;height:auto;" />
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 28px 0;font-family:Arial,sans-serif;">
                  <div style="border:1px solid rgba(227,189,143,.35);background:#1a1115;border-radius:14px;padding:16px;color:#f4ecef;font-size:14px;line-height:1.6;">
                    A gestao da AAAU vai entrar em contato para informar a entrega ou retirada do pedido. Fica de olho no WhatsApp e no email cadastrado.
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 28px 0;font-family:Arial,sans-serif;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                    ${buildItemsHtml(items)}
                    <tr>
                      <td style="padding:18px 0;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                          <tr>
                            <td style="font-size:13px;color:#c8b8bf;">${paidAt ? `Aprovado em ${formatDate(paidAt)}` : "Pagamento aprovado"}</td>
                            <td align="right" style="font-size:22px;font-weight:900;color:#ffffff;">${formatCurrency(total)}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:0 28px 28px;font-family:Arial,sans-serif;">
                  <a href="${baseUrl}/produtos" style="display:inline-block;background:#b0173f;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 20px;font-size:13px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;">Ver loja AAAU</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function buildInternalOrderHtml({
  orderNumber,
  customerName,
  customerEmail,
  customerPhone,
  customerCampus,
  total,
  items,
}: {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerCampus: string | null;
  total: number;
  items: EmailItem[];
}) {
  const baseUrl = getBaseUrl();
  const logoUrl = `${baseUrl}/images/brand/Logo%20AAAU%20PNG.png`;
  const mascotUrl = `${baseUrl}/images/mascots/bull_preloading.png`;

  return `
    <div style="margin:0;padding:0;background:#080607;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#080607;border-collapse:collapse;">
        <tr>
          <td align="center" style="padding:28px 12px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;border-collapse:collapse;background:#120d0f;border:1px solid rgba(255,255,255,.12);border-radius:18px;overflow:hidden;">
              <tr>
                <td style="padding:26px 28px;background:#7b1023;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td><img src="${logoUrl}" width="92" alt="AAAU" style="display:block;width:92px;height:auto;" /></td>
                      <td align="right" style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#ffffff;">Novo pedido pago</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:30px 28px 0;font-family:Arial,sans-serif;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td valign="top">
                        <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#e3bd8f;font-weight:800;">${escapeHtml(orderNumber)}</div>
                        <h1 style="margin:10px 0 12px;font-size:30px;line-height:1.05;color:#ffffff;text-transform:uppercase;">Pedido pago para separar.</h1>
                      </td>
                      <td align="right" width="120"><img src="${mascotUrl}" width="98" alt="Mascote AAAU" style="display:block;width:98px;height:auto;" /></td>
                    </tr>
                  </table>
                  <div style="background:#1a1115;border:1px solid rgba(227,189,143,.35);border-radius:14px;padding:16px;color:#f4ecef;font-size:14px;line-height:1.7;">
                    <strong>Cliente:</strong> ${escapeHtml(customerName)}<br />
                    <strong>Email:</strong> ${escapeHtml(customerEmail)}<br />
                    <strong>WhatsApp:</strong> ${escapeHtml(customerPhone)}<br />
                    <strong>Campus:</strong> ${escapeHtml(customerCampus || "Nao informado")}<br />
                    <strong>Total:</strong> ${formatCurrency(total)}
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 28px 0;font-family:Arial,sans-serif;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                    ${buildItemsHtml(items)}
                    <tr>
                      <td style="padding:18px 0;text-align:right;font-size:22px;font-weight:900;color:#ffffff;">${formatCurrency(total)}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:0 28px 28px;font-family:Arial,sans-serif;color:#c8b8bf;font-size:13px;line-height:1.6;">
                  Entrar em contato com o comprador para combinar entrega ou retirada.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

export async function sendOrderPaidEmails(orderId: string) {
  const config = getTransactionalEmailConfig();

  if (!config) {
    return { skipped: true };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            include: {
              images: {
                orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!order) {
    return { skipped: true };
  }

  const items = order.items.map((item) => ({
    productName: item.productName,
    size: item.size,
    customName: item.customName,
    customNumber: item.customNumber,
    quantity: item.quantity,
    lineTotal: Number(item.lineTotal),
    imageUrl: item.product?.images[0]?.url ?? null,
  }));
  const customerMessage = {
    subject: `Pagamento confirmado - ${order.orderNumber}`,
    text: buildOrderText({
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      total: Number(order.total),
      items,
    }),
    html: buildCustomerHtml({
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      total: Number(order.total),
      paidAt: order.paidAt,
      items,
    }),
  };
  await sendTrackedEmail({
    kind: EmailDeliveryKind.STORE_ORDER_CONFIRMATION,
    idempotencyKey: `store-order-confirmation/${order.id}`,
    orderId: order.id,
    to: order.customerEmail,
    subject: customerMessage.subject,
    text: customerMessage.text,
    html: customerMessage.html,
  });

  if (config.internalRecipient && config.internalRecipient !== order.customerEmail) {
    await sendTrackedEmail({
      kind: EmailDeliveryKind.INTERNAL_ORDER_NOTIFICATION,
      idempotencyKey: `internal-order-notification/${order.id}`,
      orderId: order.id,
      to: config.internalRecipient,
      subject: `Novo pedido pago - ${order.orderNumber}`,
      text: [
        `Pedido pago: ${order.orderNumber}`,
        `Cliente: ${order.customerName}`,
        `Email: ${order.customerEmail}`,
        `WhatsApp: ${order.customerPhone}`,
        `Campus: ${order.customerCampus ?? "Nao informado"}`,
        `Total: ${formatCurrency(Number(order.total))}`,
      ].join("\n"),
      html: buildInternalOrderHtml({
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        customerCampus: order.customerCampus,
        total: Number(order.total),
        items,
      }),
    });
  }

  return { skipped: false };
}
