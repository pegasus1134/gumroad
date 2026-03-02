export interface GumroadUser {
  bio: string | null;
  name: string;
  twitter_handle: string | null;
  user_id: string;
  email: string | null;
  url: string | null;
  profile_url: string;
}

export interface GumroadProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  short_url: string;
  formatted_price: string;
  published: boolean;
  sales_count: number;
  sales_usd_cents: number;
  url: string;
  preview_url: string | null;
  thumbnail_url: string | null;
  custom_permalink: string | null;
  custom_receipt: string | null;
  custom_summary: string | null;
  is_tiered_membership: boolean;
  recurrences: string[] | null;
  variants: GumroadVariantCategory[];
  custom_fields: GumroadCustomField[];
}

export interface GumroadVariantCategory {
  id: string;
  title: string;
  variants: GumroadVariant[];
}

export interface GumroadVariant {
  id: string;
  name: string;
  price_difference_cents: number;
  max_purchase_count: number | null;
  description: string | null;
}

export interface GumroadCustomField {
  name: string;
  required: boolean;
  type: string;
}

export interface GumroadOfferCode {
  id: string;
  name: string;
  amount_off?: number;
  percent_off?: number;
  offer_type?: "cents" | "percent";
  max_purchase_count: number | null;
  universal: boolean;
  times_used: number;
}

export interface GumroadSKU {
  id: string;
  name: string;
  price_difference_cents: number;
  max_purchase_count: number | null;
}

export interface GumroadSale {
  id: string;
  email: string;
  seller_id: string;
  timestamp: string;
  created_at: string;
  product_name: string;
  product_id: string;
  price: number;
  formatted_total_price: string;
  formatted_display_price: string;
  currency_symbol: string;
  refunded: boolean;
  partially_refunded: boolean;
  chargebacked: boolean;
  purchase_email: string;
  shipping_information: Record<string, string> | null;
  is_product_physical: boolean;
  shipped: boolean;
  license_key: string | null;
  quantity: number;
  order_id: number;
  is_recurring_charge: boolean;
  variants: Record<string, string> | null;
  custom_fields: Record<string, string> | null;
  gumroad_fee: number;
  subscription_id: string | null;
}

export interface GumroadSubscriber {
  id: string;
  product_id: string;
  product_name: string;
  user_id: string;
  user_email: string;
  purchase_ids: string[];
  created_at: string;
  cancelled_at: string | null;
  user_requested_cancellation_at: string | null;
  charge_occurrence_count: number | null;
  recurrence: string;
  ended_at: string | null;
  failed_at: string | null;
  free_trial_ends_at: string | null;
  license_key: string;
  status: string;
}

export interface GumroadPayout {
  id: string | null;
  amount_cents: number;
  user_id: string;
  created_at: string;
  is_completed: boolean;
  display_amount: string;
}

export interface GumroadResourceSubscription {
  id: string;
  resource_name: string;
  post_url: string;
}

export type ResourceName =
  | "sale"
  | "refund"
  | "dispute"
  | "dispute_won"
  | "cancellation"
  | "subscription_updated"
  | "subscription_ended"
  | "subscription_restarted";

export const RESOURCE_NAMES: ResourceName[] = [
  "sale",
  "refund",
  "dispute",
  "dispute_won",
  "cancellation",
  "subscription_updated",
  "subscription_ended",
  "subscription_restarted",
];

export interface PaginatedResponse<T> {
  success: boolean;
  [key: string]: T[] | string | boolean | undefined;
  next_page_url?: string;
  next_page_key?: string;
}

export class GumroadApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = "GumroadApiError";
  }
}

export class AuthenticationError extends GumroadApiError {
  constructor(message = "Not authenticated. Run: gumroad auth login") {
    super(message, 401);
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends GumroadApiError {
  constructor(
    public readonly retryAfter?: number,
  ) {
    super(
      retryAfter
        ? `Rate limited. Retry after ${retryAfter} seconds.`
        : "Rate limited. Please try again later.",
      429,
    );
    this.name = "RateLimitError";
  }
}
