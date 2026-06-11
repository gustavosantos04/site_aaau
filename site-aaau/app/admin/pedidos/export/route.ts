import { NextResponse } from "next/server";
import type { OrderStatus } from "@prisma/client";

import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

function normalize(value: string) {
  return value.toLowerCase().replace(/\D/g, "");
}

function csvValue(value: string | number | null | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function formatCpf(value?: string | null, last4?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }

  return last4 ? `***.***.***-${last4}` : "";
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }

  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }

  return value;
}

function formatDate(value?: Date | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function customizationLabel(customName?: string | null, customNumber?: string | null) {
  if (customName && customNumber) {
    return `${customName}+${customNumber}`;
  }

  return customName || customNumber || "";
}

export async function GET(request: Request) {
  await requireAdminSession();

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "ALL";
  const search = url.searchParams.get("busca")?.trim() ?? "";
  const digits = normalize(search);
  const term = search.toLowerCase();
  const statusFilter =
    status !== "ALL" && status
      ? {
          status: status as OrderStatus,
        }
      : {};
  const orders = await prisma.order.findMany({
    where: statusFilter,
    include: {
      items: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const filteredOrders = orders.filter((order) => {
    const values = [
      order.customerName,
      order.customerCpf ?? "",
      order.customerCpfLast4 ?? "",
      order.customerEmail,
      order.customerPhone,
      order.customerCampus ?? "",
      order.orderNumber,
    ];

    return (
      !search ||
      values.some(
        (value) =>
          value.toLowerCase().includes(term) ||
          (digits ? normalize(value).includes(digits) : false),
      )
    );
  });

  const rows = [
    [
      "Pedido",
      "Data do pedido",
      "Data de pagamento aprovado",
      "Status do pedido",
      "Status do pagamento",
      "Nome completo",
      "CPF",
      "WhatsApp",
      "Email",
      "Campus",
      "Produto comprado",
      "Tamanho",
      "Personalizacao",
      "Quantidade",
      "Valor unitario",
      "Total do item",
      "Total do pedido",
      "Observacoes",
    ],
    ...filteredOrders.flatMap((order) =>
      order.items.map((item) => [
        order.orderNumber,
        formatDate(order.createdAt),
        formatDate(order.paidAt),
        order.status,
        order.paymentStatus,
        order.customerName,
        formatCpf(order.customerCpf, order.customerCpfLast4),
        formatPhone(order.customerPhone),
        order.customerEmail,
        order.customerCampus ?? "",
        item.productName,
        item.size ?? "",
        customizationLabel(item.customName, item.customNumber),
        item.quantity,
        formatMoney(Number(item.unitPrice)),
        formatMoney(Number(item.lineTotal)),
        formatMoney(Number(order.total)),
        order.notes ?? "",
      ]),
    ),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvValue).join(";")).join("\n")}`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=pedidos-aaau.csv",
    },
  });
}
