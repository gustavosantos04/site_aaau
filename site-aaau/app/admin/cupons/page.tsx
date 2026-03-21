import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { formatCurrency } from "@/lib/utils";
import { getCoupons } from "@/lib/data/store";

export const metadata: Metadata = {
  title: "Admin Cupons",
};

export default async function AdminCouponsPage() {
  const coupons = await getCoupons();

  return (
    <AdminShell
      activeHref="/admin/cupons"
      title="Cupons"
      description="Estrutura pronta para expansão com regras, validade e faixas de desconto."
    >
      <div className="space-y-4">
        {coupons.map((coupon) => (
          <article
            key={coupon.id}
            className="grid gap-4 rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5 md:grid-cols-[1fr,1fr,1fr]"
          >
            <div>
              <p className="font-semibold text-white">{coupon.code}</p>
              <p className="text-sm text-white/60">{coupon.description}</p>
            </div>
            <p className="text-sm text-white/70">
              {coupon.discountType === "PERCENTAGE"
                ? `${coupon.discountValue}%`
                : formatCurrency(coupon.discountValue)}
            </p>
            <p className="text-sm text-white/70">{coupon.isActive ? "Ativo" : "Inativo"}</p>
          </article>
        ))}
      </div>
    </AdminShell>
  );
}
