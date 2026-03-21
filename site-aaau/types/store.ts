export type ProductCategory = "APPAREL" | "UNIFORM" | "ACCESSORY";
export type CouponDiscountType = "PERCENTAGE" | "FIXED";
export type OrderStatus =
  | "PENDING"
  | "CONTACT_PENDING"
  | "CONFIRMED"
  | "FULFILLED"
  | "CANCELED";

export interface ProductImage {
  id: string;
  url: string;
  alt: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  description: string;
  category: ProductCategory;
  sizes: string[];
  featured: boolean;
  isNew: boolean;
  isActive: boolean;
  images: ProductImage[];
}

export interface Coupon {
  id: string;
  code: string;
  description?: string;
  discountType: CouponDiscountType;
  discountValue: number;
  isActive: boolean;
}

export interface EventItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  startsAt: string;
  location: string;
  coverImage?: string;
  isFeatured: boolean;
  isActive: boolean;
}

export interface AdminSnapshot {
  totalProducts: number;
  activeOrders: number;
  activeCoupons: number;
  featuredProducts: number;
}

export interface OrderItemData {
  id: string;
  productId?: string;
  productName: string;
  productSlug: string;
  size?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderData {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  total: number;
  notes?: string;
  createdAt: string;
  items: OrderItemData[];
}
