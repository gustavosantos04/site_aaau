import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth";
import { getOrders } from "@/lib/data/store";

function normalize(value: string) {
  return value.toLowerCase().replace(/\D/g, "");
}

function csvValue(value: string | number | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  await requireAdminSession();

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "ALL";
  const search = url.searchParams.get("busca")?.trim() ?? "";
  const digits = normalize(search);
  const term = search.toLowerCase();
  const orders = (await getOrders()).filter((order) => {
    const values = [
      order.customerName,
      order.customerCpf ?? "",
      order.customerEmail,
      order.customerPhone,
      order.customerCampus ?? "",
      order.orderNumber,
    ];

    return (
      (status === "ALL" || order.status === status) &&
      (!search ||
        values.some(
          (value) =>
            value.toLowerCase().includes(term) ||
            (digits ? normalize(value).includes(digits) : false),
        ))
    );
  });

  const rows = [
    [
      "pedido",
      "comprador",
      "cpf",
      "email",
      "whatsapp",
      "campus",
      "status_pedido",
      "status_pagamento",
      "total",
      "produtos",
      "data",
    ],
    ...orders.map((order) => [
      order.orderNumber,
      order.customerName,
      order.customerCpf,
      order.customerEmail,
      order.customerPhone,
      order.customerCampus,
      order.status,
      order.paymentStatus ?? "PENDING",
      order.total,
      order.items
        .map((item) => `${item.productName} (${item.quantity}x ${item.size ?? ""})`)
        .join("; "),
      order.createdAt,
    ]),
  ];
  const csv = rows.map((row) => row.map(csvValue).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=pedidos-aaau.csv",
    },
  });
}
