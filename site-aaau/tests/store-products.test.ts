import assert from "node:assert/strict";
import { afterEach, test, mock } from "node:test";
import { Prisma } from "@prisma/client";
import { buildProductMetadata } from "@/lib/store/product-metadata";
import { createCheckout } from "@/lib/checkout/mercado-pago";
import { prisma } from "@/lib/db/prisma";

const originalEnv = { ...process.env };
const restoreDelegates: Array<() => void> = [];
afterEach(() => {
  mock.restoreAll();
  restoreDelegates.splice(0).forEach((restore) => restore());
  process.env = { ...originalEnv };
});
const variants = [
  { id: "regata", label: "Regata", price: 80.25 },
  { id: "conjunto", label: "Conjunto Completo", price: 130.50 },
]; // Synthetic test prices only; no catalog records are created.
function form(rows: unknown) {
  const data = new FormData(); data.set("variants", JSON.stringify(rows)); return data;
}
test("admin creates options with Brazilian decimal notation and preserves metadata", () => {
  const saved = buildProductMetadata(form(variants.map((row) => ({ ...row, price: String(row.price).replace(".", ",") }))), {
    variants: [{ ...variants[0], requiredOptionIds: ["color"], description: "Existing description" }],
    options: [{ id: "color" }], measurementGuide: { title: "Guide" }, customMetadata: true,
  });
  assert.equal((saved.variants as typeof variants)[1].price, 130.5);
  assert.deepEqual((saved.variants as Array<{ requiredOptionIds?: string[] }>)[0].requiredOptionIds, ["color"]);
  assert.equal(saved.customMetadata, true);
  assert.deepEqual(saved.measurementGuide, { title: "Guide" });
});
test("admin can rename, remove options, and save a simple product", () => {
  assert.deepEqual(buildProductMetadata(form([]), { variants }).variants, []);
  assert.equal((buildProductMetadata(form([{ ...variants[0], label: "Novo nome" }]), { variants }).variants as typeof variants)[0].label, "Novo nome");
});
test("admin rejects invalid or duplicate options and malformed JSON", () => {
  for (const rows of [ [{ ...variants[0], price: 0 }], [{ ...variants[0], price: -1 }],
    [{ ...variants[0], price: "abc" }], [{ ...variants[0], price: 1.234 }],
    [{ ...variants[0], label: " " }], [variants[0], variants[0]] ]) {
    assert.throws(() => buildProductMetadata(form(rows)));
  }
  const data = new FormData(); data.set("variants", "invalid");
  assert.throws(() => buildProductMetadata(data));
});
test("legacy admin submission preserves option identities and extra properties", () => {
  const data = new FormData(); data.set("variantPrice:regata", "90,25");
  const saved = buildProductMetadata(data, { variants });
  assert.equal((saved.variants as typeof variants)[0].price, 90.25);
  assert.equal((saved.variants as typeof variants)[1].price, 130.5);
});

let requestIndex = 0;
async function checkoutCase({ simple = false, variantId, size = "M", detailed = false }: { simple?: boolean; variantId?: string; size?: string; detailed?: boolean }) {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
  process.env.MERCADO_PAGO_ACCESS_TOKEN = "TEST-synthetic";
  process.env.NEXT_PUBLIC_SITE_URL = "https://aaau.test";
  const product = {
    id: "synthetic-product", slug: "synthetic-product", name: simple ? "Camiseta Unihitter" : "Uniforme de Basquete AAAU",
    price: new Prisma.Decimal(70), sizes: ["P", "M"], stock: 10,
    requiresCustomization: false, metadata: simple ? { variants: [] } : { variants },
    stockItems: detailed ? variants.map((variant) => ({ id: `stock-${variant.id}`, variantId: variant.id, size: "M", stock: 5 })) : [],
  };
  let savedOrder: Record<string, unknown> | undefined;
  let preference: { items: Array<{ title: string; unit_price: number; quantity: number }> } | undefined;
  let reservation: unknown;
  // Prisma delegates are proxies; replace their methods explicitly.
  const findMany = prisma.product.findMany;
  const update = prisma.order.update;
  prisma.product.findMany = (async () => [product]) as unknown as typeof findMany;
  prisma.order.update = (async () => ({})) as unknown as typeof update;
  restoreDelegates.push(() => { prisma.product.findMany = findMany; prisma.order.update = update; });
  const tx = {
    product: { updateMany: async (input: unknown) => { reservation = input; return { count: 1 }; } },
    productStockItem: { updateMany: async (input: unknown) => { reservation = input; return { count: 1 }; } },
    order: { create: async ({ data }: { data: { items: { create: unknown[] } } }) => {
      savedOrder = data;
      return { id: "synthetic-order", items: data.items.create };
    } },
  };
  const transaction = prisma.$transaction;
  prisma.$transaction = (async (callback: (client: typeof tx) => unknown) => callback(tx)) as unknown as typeof transaction;
  restoreDelegates.push(() => { prisma.$transaction = transaction; });
  mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    preference = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ id: "synthetic-preference", sandbox_init_point: "https://aaau.test/pay" }), { status: 200 });
  });
  const result = await createCheckout(new Request("https://aaau.test/api/checkout", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `192.0.2.${++requestIndex}` },
    body: JSON.stringify({ buyer: { fullName: "Test Buyer", cpf: "52998224725", email: "test@example.com", whatsapp: "11999999999", campus: "Test Campus" },
      items: [{ productId: product.id, variantId, size, quantity: 2, price: 0.01, variantPrice: 0.01, unitPrice: 0.01, variantLabel: "Fake" }] }),
  }));
  return { result, savedOrder, preference, reservation };
}
for (const variant of variants) {
  test(`checkout ${variant.label}: database price, order snapshot and Mercado Pago agree despite forged prices`, async () => {
    const { result, savedOrder, preference } = await checkoutCase({ variantId: variant.id });
    assert.equal(result.status, 200);
    const item = (savedOrder?.items as { create: Array<{ productName: string; unitPrice: Prisma.Decimal; size: string }> }).create[0];
    assert.equal(Number(item.unitPrice), variant.price);
    assert.equal(item.productName, `Uniforme de Basquete AAAU - ${variant.label}`);
    assert.equal(item.size, "M");
    assert.equal(Number(savedOrder?.total), variant.price * 2);
    assert.equal(preference?.items[0].unit_price, variant.price);
    assert.equal(preference?.items[0].quantity, 2);
    assert.match(preference?.items[0].title ?? "", new RegExp(variant.label));
  });
}
test("simple and existing products still use the database base price", async () => {
  const { result, savedOrder, preference } = await checkoutCase({ simple: true });
  assert.equal(result.status, 200);
  assert.equal(Number(savedOrder?.total), 140);
  assert.equal(preference?.items[0].unit_price, 70);
  assert.match(preference?.items[0].title ?? "", /Camiseta Unihitter/);
});
for (const variantId of [undefined, "unknown"]) {
  test(`checkout rejects missing/unknown modality (${variantId}) before creating a preference`, async () => {
    const { result, savedOrder, preference } = await checkoutCase({ variantId });
    assert.equal(result.status, 400); assert.equal(savedOrder, undefined); assert.equal(preference, undefined);
  });
}
test("checkout rejects variants on simple products", async () => {
  const { result } = await checkoutCase({ simple: true, variantId: "regata" });
  assert.equal(result.status, 400);
});
test("checkout still requires valid sizes", async () => {
  const { result } = await checkoutCase({ variantId: "regata", size: "XXL" });
  assert.equal(result.status, 400);
});
test("checkout reserves the selected modality and size inventory", async () => {
  const { result, reservation } = await checkoutCase({ variantId: "conjunto", detailed: true });
  assert.equal(result.status, 200);
  assert.deepEqual(reservation, { where: { id: "stock-conjunto", stock: { gte: 2 } }, data: { stock: { decrement: 2 } } });
});
