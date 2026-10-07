import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { ProductOptionsFields } from "@/components/admin/product-options-fields";
import { ProductPurchasePanel } from "@/components/store/product-purchase-panel";
import { CartProvider, useCart } from "@/features/cart/cart-provider";
import { productsSeed } from "@/lib/data/seed-content";
import type { Product } from "@/types/store";

let render: typeof import("@testing-library/react").render;
let screen: typeof import("@testing-library/react").screen;
let fireEvent: typeof import("@testing-library/react").fireEvent;
let cleanup: typeof import("@testing-library/react").cleanup;
before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://aaau.test/produtos" });
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document,
    navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, React, self: dom.window,
    localStorage: dom.window.localStorage })) Object.defineProperty(globalThis, name, { configurable: true, value });
  ({ render, screen, fireEvent, cleanup } = await import("@testing-library/react"));
});
afterEach(() => { cleanup(); localStorage.clear(); });
const simple: Product = {
  id: "synthetic", slug: "synthetic", name: "Camiseta Unihitter", description: "Synthetic product for tests",
  price: 70, category: "APPAREL", sizes: ["P", "M"], stock: 10, requiresCustomization: false,
  featured: false, isNew: false, isActive: true, images: [],
};
const uniform: Product = { ...simple, name: "Uniforme de Basquete AAAU", variants: [
  { id: "regata", label: "Regata", price: 80.25 }, { id: "conjunto", label: "Conjunto Completo", price: 130.5 },
] };
function CartProbe() { return <pre data-testid="cart">{JSON.stringify(useCart().items)}</pre>; }
function mount(product: Product) { render(<CartProvider><ProductPurchasePanel product={product} /><CartProbe /></CartProvider>); }
function addButton() { return screen.getByRole("button", { name: "Adicionar ao carrinho" }) as HTMLButtonElement; }
function cart() { return JSON.parse(screen.getByTestId("cart").textContent ?? "[]") as Array<{ price: number; variantId?: string; size: string; name: string }>; }

test("simple Unihitter requires size and keeps one price", () => {
  mount(simple); assert.equal(addButton().disabled, true);
  fireEvent.click(screen.getByRole("button", { name: "M" }));
  assert.equal(addButton().disabled, false); fireEvent.click(addButton());
  assert.equal(cart()[0].price, 70); assert.equal(cart()[0].size, "M");
  assert.equal(cart()[0].variantId, undefined);
});
test("uniform requires modality and size, with independent cart lines and prices", () => {
  mount(uniform); fireEvent.click(screen.getByRole("button", { name: "M" }));
  assert.equal(addButton().disabled, true);
  fireEvent.click(screen.getByRole("button", { name: /^Regata/ }));
  assert.equal(addButton().disabled, false);
  // The header updates as well as the price shown inside the option.
  assert.equal(screen.getAllByText(/80,25/).length, 2);
  fireEvent.click(addButton());
  fireEvent.click(screen.getByRole("button", { name: /^Conjunto Completo/ }));
  assert.equal(screen.getAllByText(/130,50/).length, 2);
  fireEvent.click(screen.getByRole("button", { name: "Adicionado" }));
  assert.deepEqual(cart().map((item) => [item.variantId, item.price, item.size]), [["regata", 80.25, "M"], ["conjunto", 130.5, "M"]]);
});
test("detailed stock prevents buying an unavailable modality-size combination", () => {
  mount({ ...uniform, stockItems: [{ id: "stock", variantId: "regata", size: "M", stock: 2 }] });
  assert.equal((screen.getByRole("button", { name: /^Conjunto Completo/ }) as HTMLButtonElement).disabled, true);
  fireEvent.click(screen.getByRole("button", { name: /^Regata/ }));
  assert.equal((screen.getByRole("button", { name: /P - Esgotado/ }) as HTMLButtonElement).disabled, true);
  fireEvent.click(screen.getByRole("button", { name: "M" })); assert.equal(addButton().disabled, false);
});
test("existing simple catalog product remains purchasable", () => {
  const product = productsSeed.find((entry) => !entry.variants?.length && !entry.requiresCustomization && !entry.options?.length && entry.stock > 0);
  assert.ok(product); mount(product);
  fireEvent.click(screen.getByRole("button", { name: product.sizes[0] }));
  fireEvent.click(addButton()); assert.equal(cart()[0].price, product.price);
});
test("admin adds, edits and removes price options, with matching inventory fields", () => {
  render(<form data-testid="form"><ProductOptionsFields product={simple} /></form>);
  fireEvent.click(screen.getByRole("button", { name: "Adicionar opção" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Nome da opção 1" }), { target: { value: "Regata" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Preço da opção 1" }), { target: { value: "80,25" } });
  assert.ok(screen.getByRole("spinbutton", { name: "Estoque Regata / M" }));
  const input = screen.getByTestId("form").querySelector('input[name="variants"]') as HTMLInputElement;
  const rows = JSON.parse(input.value); assert.equal(rows[0].label, "Regata"); assert.equal(rows[0].price, "80,25");
  fireEvent.click(screen.getByRole("button", { name: "Remover opção 1" })); assert.equal(input.value, "[]");
  assert.ok(screen.getByRole("spinbutton", { name: "Estoque Produto / M" }));
});
