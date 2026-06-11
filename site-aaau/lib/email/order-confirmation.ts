import nodemailer from "nodemailer";

import { prisma } from "@/lib/db/prisma";

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

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!host || !port || !user || !pass || !from) {
    return null;
  }

  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user, pass },
    from,
    internalRecipient: process.env.ORDER_NOTIFICATION_EMAIL?.trim(),
  };
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
  items: Array<{ productName: string; quantity: number; lineTotal: number }>;
}) {
  const itemLines = items
    .map((item) => `- ${item.quantity}x ${item.productName}: ${formatCurrency(item.lineTotal)}`)
    .join("\n");

  return [
    `Ola, ${customerName.split(" ")[0] || "cliente"}.`,
    "",
    `Recebemos a confirmacao do pagamento do pedido ${orderNumber}.`,
    "",
    itemLines,
    "",
    `Total: ${formatCurrency(total)}`,
    "",
    "A AAAU entrara em contato se precisar confirmar algum detalhe do pedido.",
  ].join("\n");
}

function buildOrderHtml({
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
  items: Array<{ productName: string; quantity: number; lineTotal: number }>;
}) {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #eee;">${item.quantity}x ${item.productName}</td>
          <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(item.lineTotal)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;color:#151515;line-height:1.5;">
      <h1 style="font-size:22px;margin:0 0 12px;">Pagamento confirmado</h1>
      <p>Ola, ${customerName.split(" ")[0] || "cliente"}.</p>
      <p>Recebemos a confirmacao do pagamento do pedido <strong>${orderNumber}</strong>.</p>
      ${paidAt ? `<p>Pagamento aprovado em ${formatDate(paidAt)}.</p>` : ""}
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        ${rows}
        <tr>
          <td style="padding:14px 0;font-weight:700;">Total</td>
          <td style="padding:14px 0;text-align:right;font-weight:700;">${formatCurrency(total)}</td>
        </tr>
      </table>
      <p>A AAAU entrara em contato se precisar confirmar algum detalhe do pedido.</p>
    </div>
  `;
}

export async function sendOrderPaidEmails(orderId: string) {
  const config = getSmtpConfig();

  if (!config) {
    return { skipped: true };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        select: {
          productName: true,
          quantity: true,
          lineTotal: true,
        },
      },
    },
  });

  if (!order) {
    return { skipped: true };
  }

  const items = order.items.map((item) => ({
    productName: item.productName,
    quantity: item.quantity,
    lineTotal: Number(item.lineTotal),
  }));
  const message = {
    subject: `Pagamento confirmado - ${order.orderNumber}`,
    text: buildOrderText({
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      total: Number(order.total),
      items,
    }),
    html: buildOrderHtml({
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      total: Number(order.total),
      paidAt: order.paidAt,
      items,
    }),
  };
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });

  await transporter.sendMail({
    from: config.from,
    to: order.customerEmail,
    ...message,
  });

  if (config.internalRecipient && config.internalRecipient !== order.customerEmail) {
    await transporter.sendMail({
      from: config.from,
      to: config.internalRecipient,
      subject: `Novo pedido pago - ${order.orderNumber}`,
      text: [
        `Pedido pago: ${order.orderNumber}`,
        `Cliente: ${order.customerName}`,
        `Email: ${order.customerEmail}`,
        `WhatsApp: ${order.customerPhone}`,
        `Total: ${formatCurrency(Number(order.total))}`,
      ].join("\n"),
      html: message.html,
    });
  }

  return { skipped: false };
}
