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
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  isOpen: boolean;
  couponCode: string;
  subtotal: number;
  discount: number;
  total: number;
  addItem: (product: Product, size: string) => void;
  updateQuantity: (productId: string, size: string, quantity: number) => void;
  removeItem: (productId: string, size: string) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  applyCoupon: (code: string) => boolean;
}

const STORAGE_KEY = "aaau-cart";
const COUPON_STORAGE_KEY = "aaau-cart-coupon";

const CartContext = createContext<CartContextValue | null>(null);

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

  function addItem(product: Product, size: string) {
    const image =
      product.images.find((entry) => entry.isPrimary)?.url ??
      product.images[0]?.url ??
      "";

    setItems((currentItems) => {
      const existing = currentItems.find(
        (item) => item.productId === product.id && item.size === size,
      );

      if (existing) {
        return currentItems.map((item) =>
          item.productId === product.id && item.size === size
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
          quantity: 1,
        },
      ];
    });

    setIsOpen(true);
  }

  function updateQuantity(productId: string, size: string, quantity: number) {
    if (quantity <= 0) {
      removeItem(productId, size);
      return;
    }

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.productId === productId && item.size === size
          ? { ...item, quantity }
          : item,
      ),
    );
  }

  function removeItem(productId: string, size: string) {
    setItems((currentItems) =>
      currentItems.filter(
        (item) => !(item.productId === productId && item.size === size),
      ),
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
