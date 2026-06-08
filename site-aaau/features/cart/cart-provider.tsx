"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { couponsSeed } from "@/lib/data/seed-content";
import type { Product } from "@/types/store";

export interface CartItem {
  productId: string;
  slug: string;
  name: string;
  image: string;
  price: number;
  size: string;
  customName?: string;
  customNumber?: string;
  quantity: number;
}

export interface CartItemCustomization {
  customName?: string;
  customNumber?: string;
}

interface CartContextValue {
  items: CartItem[];
  isOpen: boolean;
  couponCode: string;
  subtotal: number;
  discount: number;
  total: number;
  addItem: (
    product: Product,
    size: string,
    customization?: CartItemCustomization,
  ) => void;
  updateQuantity: (itemKey: string, quantity: number) => void;
  removeItem: (itemKey: string) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  applyCoupon: (code: string) => boolean;
}

const STORAGE_KEY = "aaau-cart";
const COUPON_STORAGE_KEY = "aaau-cart-coupon";

const CartContext = createContext<CartContextValue | null>(null);

export function getCartItemKey(item: Pick<CartItem, "productId" | "size" | "customName" | "customNumber">) {
  return [
    item.productId,
    item.size,
    item.customName?.trim().toUpperCase() ?? "",
    item.customNumber?.trim() ?? "",
  ].join("::");
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [couponCode, setCouponCode] = useState("");

  useEffect(() => {
    try {
      const rawItems = window.localStorage.getItem(STORAGE_KEY);
      const rawCoupon = window.localStorage.getItem(COUPON_STORAGE_KEY);

      if (rawItems) {
        setItems(JSON.parse(rawItems) as CartItem[]);
      }

      if (rawCoupon) {
        setCouponCode(rawCoupon);
      }
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    window.localStorage.setItem(COUPON_STORAGE_KEY, couponCode);
  }, [couponCode]);

  const subtotal = useMemo(
    () => items.reduce((acc, item) => acc + item.price * item.quantity, 0),
    [items],
  );

  const discount = useMemo(() => {
    const coupon = couponsSeed.find(
      (item) => item.code === couponCode && item.isActive,
    );

    if (!coupon) {
      return 0;
    }

    if (coupon.discountType === "FIXED") {
      return coupon.discountValue;
    }

    return subtotal * (coupon.discountValue / 100);
  }, [couponCode, subtotal]);

  const total = Math.max(subtotal - discount, 0);

  function addItem(
    product: Product,
    size: string,
    customization: CartItemCustomization = {},
  ) {
    const image =
      product.images.find((entry) => entry.isPrimary)?.url ??
      product.images[0]?.url ??
      "";
    const customName = customization.customName?.trim() || undefined;
    const customNumber = customization.customNumber?.trim() || undefined;

    setItems((currentItems) => {
      const nextItemKey = getCartItemKey({
        productId: product.id,
        size,
        customName,
        customNumber,
      });
      const existing = currentItems.find(
        (item) => getCartItemKey(item) === nextItemKey,
      );

      if (existing) {
        return currentItems.map((item) =>
          getCartItemKey(item) === nextItemKey
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [
        ...currentItems,
        {
          productId: product.id,
          slug: product.slug,
          name: product.name,
          image,
          price: product.price,
          size,
          customName,
          customNumber,
          quantity: 1,
        },
      ];
    });

    setIsOpen(true);
  }

  function updateQuantity(itemKey: string, quantity: number) {
    if (quantity <= 0) {
      removeItem(itemKey);
      return;
    }

    setItems((currentItems) =>
      currentItems.map((item) =>
        getCartItemKey(item) === itemKey
          ? { ...item, quantity }
          : item,
      ),
    );
  }

  function removeItem(itemKey: string) {
    setItems((currentItems) =>
      currentItems.filter((item) => getCartItemKey(item) !== itemKey),
    );
  }

  function clearCart() {
    setItems([]);
    setCouponCode("");
  }

  function applyCoupon(code: string) {
    const normalized = code.trim().toUpperCase();
    const coupon = couponsSeed.find(
      (item) => item.code === normalized && item.isActive,
    );

    if (!coupon) {
      setCouponCode("");
      return false;
    }

    setCouponCode(normalized);
    return true;
  }

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        couponCode,
        subtotal,
        discount,
        total,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        openCart: () => setIsOpen(true),
        closeCart: () => setIsOpen(false),
        applyCoupon,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }

  return context;
}
