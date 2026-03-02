import {
  GumroadApiError,
  AuthenticationError,
  RateLimitError,
  type PaginatedResponse,
} from "./types.js";

const API_BASE = "https://api.gumroad.com/v2";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface ClientOptions {
  token: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  params?: Record<string, string>;
  body?: Record<string, string>;
  timeout?: number;
}

export class GumroadClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: ClientOptions) {
    this.token = options.token;
    this.baseUrl = options.baseUrl ?? API_BASE;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", params, body, timeout } = options;

    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      timeout ?? this.timeoutMs,
    );

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      };

      let fetchBody: string | undefined;
      if (body && (method === "POST" || method === "PUT" || method === "DELETE")) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        fetchBody = new URLSearchParams(body).toString();
      }

      const response = await fetch(url.toString(), {
        method,
        headers,
        body: fetchBody,
        signal: controller.signal,
      });

      if (response.status === 401) {
        throw new AuthenticationError();
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        throw new RateLimitError(
          retryAfter ? parseInt(retryAfter, 10) : undefined,
        );
      }

      const text = await response.text();

      if (!response.ok) {
        throw new GumroadApiError(
          `API request failed: ${response.status} ${response.statusText}`,
          response.status,
          text,
        );
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new GumroadApiError(
          "Failed to parse API response as JSON",
          response.status,
          text,
        );
      }
    } catch (error) {
      if (error instanceof GumroadApiError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new GumroadApiError(
          `Request timed out after ${timeout ?? this.timeoutMs}ms`,
          0,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async *paginate<T>(
    path: string,
    dataKey: string,
    options: RequestOptions = {},
  ): AsyncGenerator<T[], void, undefined> {
    let pageKey: string | undefined;

    do {
      const params = { ...options.params };
      if (pageKey) {
        params.page_key = pageKey;
      }

      const response = await this.request<PaginatedResponse<T>>(path, {
        ...options,
        params,
      });

      const items = response[dataKey] as T[] | undefined;
      if (items && items.length > 0) {
        yield items;
      }

      pageKey = response.next_page_key;
    } while (pageKey);
  }

  async paginateAll<T>(
    path: string,
    dataKey: string,
    options: RequestOptions & { limit?: number } = {},
  ): Promise<T[]> {
    const { limit, ...requestOptions } = options;
    const all: T[] = [];

    for await (const page of this.paginate<T>(path, dataKey, requestOptions)) {
      all.push(...page);
      if (limit && all.length >= limit) {
        return all.slice(0, limit);
      }
    }

    return all;
  }

  async getUser() {
    const res = await this.request<{ success: boolean; user: import("./types.js").GumroadUser }>(
      "/user",
    );
    return res.user;
  }

  async listProducts() {
    const res = await this.request<{
      success: boolean;
      products: import("./types.js").GumroadProduct[];
    }>("/products");
    return res.products;
  }

  async getProduct(productId: string) {
    validateId(productId, "product");
    const res = await this.request<{
      success: boolean;
      product: import("./types.js").GumroadProduct;
    }>(`/products/${encodeURIComponent(productId)}`);
    return res.product;
  }

  async enableProduct(productId: string) {
    validateId(productId, "product");
    const res = await this.request<{
      success: boolean;
      product: import("./types.js").GumroadProduct;
    }>(`/products/${encodeURIComponent(productId)}/enable`, { method: "PUT" });
    return res.product;
  }

  async disableProduct(productId: string) {
    validateId(productId, "product");
    const res = await this.request<{
      success: boolean;
      product: import("./types.js").GumroadProduct;
    }>(`/products/${encodeURIComponent(productId)}/disable`, { method: "PUT" });
    return res.product;
  }

  async deleteProduct(productId: string) {
    validateId(productId, "product");
    const res = await this.request<{ success: boolean }>(
      `/products/${encodeURIComponent(productId)}`,
      { method: "DELETE" },
    );
    return res.success;
  }

  async listSales(
    options: {
      after?: string;
      before?: string;
      productId?: string;
      email?: string;
      pageKey?: string;
      limit?: number;
    } = {},
  ) {
    const params: Record<string, string> = {};
    if (options.after) params.after = options.after;
    if (options.before) params.before = options.before;
    if (options.productId) params.product_id = options.productId;
    if (options.email) params.email = options.email;
    if (options.pageKey) params.page_key = options.pageKey;

    if (options.limit) {
      return this.paginateAll<import("./types.js").GumroadSale>("/sales", "sales", {
        params,
        limit: options.limit,
      });
    }

    const res = await this.request<{
      success: boolean;
      sales: import("./types.js").GumroadSale[];
      next_page_url?: string;
      next_page_key?: string;
    }>("/sales", { params });
    return res.sales;
  }

  async getSale(saleId: string) {
    validateId(saleId, "sale");
    const res = await this.request<{
      success: boolean;
      sale: import("./types.js").GumroadSale;
    }>(`/sales/${encodeURIComponent(saleId)}`);
    return res.sale;
  }

  async markSaleAsShipped(saleId: string, trackingUrl?: string) {
    validateId(saleId, "sale");
    const body: Record<string, string> = {};
    if (trackingUrl) body.tracking_url = trackingUrl;
    const res = await this.request<{
      success: boolean;
      sale: import("./types.js").GumroadSale;
    }>(`/sales/${encodeURIComponent(saleId)}/mark_as_shipped`, {
      method: "PUT",
      body,
    });
    return res.sale;
  }

  async refundSale(saleId: string, amountCents?: number) {
    validateId(saleId, "sale");
    const body: Record<string, string> = {};
    if (amountCents !== undefined) body.amount_cents = String(amountCents);
    const res = await this.request<{
      success: boolean;
      sale: import("./types.js").GumroadSale;
    }>(`/sales/${encodeURIComponent(saleId)}/refund`, {
      method: "PUT",
      body,
    });
    return res.sale;
  }

  async listSubscribers(productId: string, email?: string) {
    validateId(productId, "product");
    const params: Record<string, string> = {};
    if (email) params.email = email;
    return this.paginateAll<import("./types.js").GumroadSubscriber>(
      `/products/${encodeURIComponent(productId)}/subscribers`,
      "subscribers",
      { params },
    );
  }

  async getSubscriber(subscriberId: string) {
    validateId(subscriberId, "subscriber");
    const res = await this.request<{
      success: boolean;
      subscriber: import("./types.js").GumroadSubscriber;
    }>(`/subscribers/${encodeURIComponent(subscriberId)}`);
    return res.subscriber;
  }

  async verifyLicense(productId: string, licenseKey: string) {
    validateId(productId, "product");
    const res = await this.request<{
      success: boolean;
      uses: number;
      purchase: import("./types.js").GumroadSale;
    }>("/licenses/verify", {
      method: "POST",
      body: { product_id: productId, license_key: licenseKey },
    });
    return res;
  }

  async enableLicense(productId: string, licenseKey: string) {
    validateId(productId, "product");
    const res = await this.request<{
      success: boolean;
      uses: number;
      purchase: import("./types.js").GumroadSale;
    }>("/licenses/enable", {
      method: "PUT",
      body: { product_id: productId, license_key: licenseKey },
    });
    return res;
  }

  async disableLicense(productId: string, licenseKey: string) {
    validateId(productId, "product");
    const res = await this.request<{
      success: boolean;
      uses: number;
      purchase: import("./types.js").GumroadSale;
    }>("/licenses/disable", {
      method: "PUT",
      body: { product_id: productId, license_key: licenseKey },
    });
    return res;
  }

  async decrementLicense(productId: string, licenseKey: string) {
    validateId(productId, "product");
    const res = await this.request<{
      success: boolean;
      uses: number;
      purchase: import("./types.js").GumroadSale;
    }>("/licenses/decrement_uses_count", {
      method: "PUT",
      body: { product_id: productId, license_key: licenseKey },
    });
    return res;
  }

  async listPayouts() {
    const res = await this.request<{
      success: boolean;
      payouts: import("./types.js").GumroadPayout[];
    }>("/payouts");
    return res.payouts;
  }

  async getPayoutById(payoutId: string) {
    const payouts = await this.listPayouts();
    return payouts.find((p) => p.id === payoutId) ?? null;
  }

  async listOfferCodes(productId: string) {
    validateId(productId, "product");
    const res = await this.request<{
      success: boolean;
      offer_codes: import("./types.js").GumroadOfferCode[];
    }>(`/products/${encodeURIComponent(productId)}/offer_codes`);
    return res.offer_codes;
  }

  async getOfferCode(productId: string, offerCodeId: string) {
    validateId(productId, "product");
    validateId(offerCodeId, "offer code");
    const res = await this.request<{
      success: boolean;
      offer_code: import("./types.js").GumroadOfferCode;
    }>(
      `/products/${encodeURIComponent(productId)}/offer_codes/${encodeURIComponent(offerCodeId)}`,
    );
    return res.offer_code;
  }

  async createOfferCode(
    productId: string,
    options: {
      name: string;
      amount_off: number;
      offer_type?: "cents" | "percent";
      max_purchase_count?: number;
      universal?: boolean;
    },
  ) {
    validateId(productId, "product");
    const body: Record<string, string> = {
      name: options.name,
      amount_off: String(options.amount_off),
    };
    if (options.offer_type) body.offer_type = options.offer_type;
    if (options.max_purchase_count !== undefined)
      body.max_purchase_count = String(options.max_purchase_count);
    if (options.universal !== undefined)
      body.universal = String(options.universal);

    const res = await this.request<{
      success: boolean;
      offer_code: import("./types.js").GumroadOfferCode;
    }>(`/products/${encodeURIComponent(productId)}/offer_codes`, {
      method: "POST",
      body,
    });
    return res.offer_code;
  }

  async updateOfferCode(
    productId: string,
    offerCodeId: string,
    options: { max_purchase_count?: number },
  ) {
    validateId(productId, "product");
    validateId(offerCodeId, "offer code");
    const body: Record<string, string> = {};
    if (options.max_purchase_count !== undefined)
      body.max_purchase_count = String(options.max_purchase_count);

    const res = await this.request<{
      success: boolean;
      offer_code: import("./types.js").GumroadOfferCode;
    }>(
      `/products/${encodeURIComponent(productId)}/offer_codes/${encodeURIComponent(offerCodeId)}`,
      { method: "PUT", body },
    );
    return res.offer_code;
  }

  async deleteOfferCode(productId: string, offerCodeId: string) {
    validateId(productId, "product");
    validateId(offerCodeId, "offer code");
    const res = await this.request<{ success: boolean }>(
      `/products/${encodeURIComponent(productId)}/offer_codes/${encodeURIComponent(offerCodeId)}`,
      { method: "DELETE" },
    );
    return res.success;
  }

  async listCustomFields(productId: string) {
    validateId(productId, "product");
    const res = await this.request<{
      success: boolean;
      custom_fields: import("./types.js").GumroadCustomField[];
    }>(`/products/${encodeURIComponent(productId)}/custom_fields`);
    return res.custom_fields;
  }

  async createCustomField(
    productId: string,
    options: { name: string; required?: boolean },
  ) {
    validateId(productId, "product");
    const body: Record<string, string> = { name: options.name };
    if (options.required !== undefined)
      body.required = String(options.required);

    const res = await this.request<{
      success: boolean;
      custom_fields: import("./types.js").GumroadCustomField[];
    }>(`/products/${encodeURIComponent(productId)}/custom_fields`, {
      method: "POST",
      body,
    });
    return res.custom_fields;
  }

  async updateCustomField(
    productId: string,
    fieldName: string,
    options: { name?: string; required?: boolean },
  ) {
    validateId(productId, "product");
    const body: Record<string, string> = {};
    if (options.name !== undefined) body.name = options.name;
    if (options.required !== undefined)
      body.required = String(options.required);

    const res = await this.request<{
      success: boolean;
      custom_fields: import("./types.js").GumroadCustomField[];
    }>(
      `/products/${encodeURIComponent(productId)}/custom_fields/${encodeURIComponent(fieldName)}`,
      { method: "PUT", body },
    );
    return res.custom_fields;
  }

  async deleteCustomField(productId: string, fieldName: string) {
    validateId(productId, "product");
    const res = await this.request<{ success: boolean }>(
      `/products/${encodeURIComponent(productId)}/custom_fields/${encodeURIComponent(fieldName)}`,
      { method: "DELETE" },
    );
    return res.success;
  }

  async listVariantCategories(productId: string) {
    validateId(productId, "product");
    const res = await this.request<{
      success: boolean;
      variant_categories: import("./types.js").GumroadVariantCategory[];
    }>(`/products/${encodeURIComponent(productId)}/variant_categories`);
    return res.variant_categories;
  }

  async getVariantCategory(productId: string, categoryId: string) {
    validateId(productId, "product");
    validateId(categoryId, "variant category");
    const res = await this.request<{
      success: boolean;
      variant_category: import("./types.js").GumroadVariantCategory;
    }>(
      `/products/${encodeURIComponent(productId)}/variant_categories/${encodeURIComponent(categoryId)}`,
    );
    return res.variant_category;
  }

  async createVariantCategory(productId: string, title: string) {
    validateId(productId, "product");
    const res = await this.request<{
      success: boolean;
      variant_category: import("./types.js").GumroadVariantCategory;
    }>(`/products/${encodeURIComponent(productId)}/variant_categories`, {
      method: "POST",
      body: { title },
    });
    return res.variant_category;
  }

  async updateVariantCategory(
    productId: string,
    categoryId: string,
    title: string,
  ) {
    validateId(productId, "product");
    validateId(categoryId, "variant category");
    const res = await this.request<{
      success: boolean;
      variant_category: import("./types.js").GumroadVariantCategory;
    }>(
      `/products/${encodeURIComponent(productId)}/variant_categories/${encodeURIComponent(categoryId)}`,
      { method: "PUT", body: { title } },
    );
    return res.variant_category;
  }

  async deleteVariantCategory(productId: string, categoryId: string) {
    validateId(productId, "product");
    validateId(categoryId, "variant category");
    const res = await this.request<{ success: boolean }>(
      `/products/${encodeURIComponent(productId)}/variant_categories/${encodeURIComponent(categoryId)}`,
      { method: "DELETE" },
    );
    return res.success;
  }

  async listVariants(productId: string, categoryId: string) {
    const category = await this.getVariantCategory(productId, categoryId);
    return category.variants;
  }

  async getVariant(
    productId: string,
    categoryId: string,
    variantId: string,
  ) {
    validateId(productId, "product");
    validateId(categoryId, "variant category");
    validateId(variantId, "variant");
    const res = await this.request<{
      success: boolean;
      variant: import("./types.js").GumroadVariant;
    }>(
      `/products/${encodeURIComponent(productId)}/variant_categories/${encodeURIComponent(categoryId)}/variants/${encodeURIComponent(variantId)}`,
    );
    return res.variant;
  }

  async createVariant(
    productId: string,
    categoryId: string,
    options: {
      name: string;
      price_difference_cents?: number;
      max_purchase_count?: number;
    },
  ) {
    validateId(productId, "product");
    validateId(categoryId, "variant category");
    const body: Record<string, string> = { name: options.name };
    if (options.price_difference_cents !== undefined)
      body.price_difference_cents = String(options.price_difference_cents);
    if (options.max_purchase_count !== undefined)
      body.max_purchase_count = String(options.max_purchase_count);

    const res = await this.request<{
      success: boolean;
      variant: import("./types.js").GumroadVariant;
    }>(
      `/products/${encodeURIComponent(productId)}/variant_categories/${encodeURIComponent(categoryId)}/variants`,
      { method: "POST", body },
    );
    return res.variant;
  }

  async updateVariant(
    productId: string,
    categoryId: string,
    variantId: string,
    options: {
      name?: string;
      price_difference_cents?: number;
      max_purchase_count?: number;
    },
  ) {
    validateId(productId, "product");
    validateId(categoryId, "variant category");
    validateId(variantId, "variant");
    const body: Record<string, string> = {};
    if (options.name !== undefined) body.name = options.name;
    if (options.price_difference_cents !== undefined)
      body.price_difference_cents = String(options.price_difference_cents);
    if (options.max_purchase_count !== undefined)
      body.max_purchase_count = String(options.max_purchase_count);

    const res = await this.request<{
      success: boolean;
      variant: import("./types.js").GumroadVariant;
    }>(
      `/products/${encodeURIComponent(productId)}/variant_categories/${encodeURIComponent(categoryId)}/variants/${encodeURIComponent(variantId)}`,
      { method: "PUT", body },
    );
    return res.variant;
  }

  async deleteVariant(
    productId: string,
    categoryId: string,
    variantId: string,
  ) {
    validateId(productId, "product");
    validateId(categoryId, "variant category");
    validateId(variantId, "variant");
    const res = await this.request<{ success: boolean }>(
      `/products/${encodeURIComponent(productId)}/variant_categories/${encodeURIComponent(categoryId)}/variants/${encodeURIComponent(variantId)}`,
      { method: "DELETE" },
    );
    return res.success;
  }

  async listResourceSubscriptions(resourceName?: import("./types.js").ResourceName) {
    if (resourceName) {
      const res = await this.request<{
        success: boolean;
        resource_subscriptions: import("./types.js").GumroadResourceSubscription[];
      }>("/resource_subscriptions", {
        params: { resource_name: resourceName },
      });
      return res.resource_subscriptions;
    }

    const { RESOURCE_NAMES } = await import("./types.js");
    const all: import("./types.js").GumroadResourceSubscription[] = [];
    for (const name of RESOURCE_NAMES) {
      try {
        const res = await this.request<{
          success: boolean;
          resource_subscriptions: import("./types.js").GumroadResourceSubscription[];
        }>("/resource_subscriptions", {
          params: { resource_name: name },
        });
        all.push(...res.resource_subscriptions);
      } catch {
      }
    }
    return all;
  }

  async createResourceSubscription(
    resourceName: import("./types.js").ResourceName,
    postUrl: string,
  ) {
    const res = await this.request<{
      success: boolean;
      resource_subscription: import("./types.js").GumroadResourceSubscription;
    }>("/resource_subscriptions", {
      method: "PUT",
      body: { resource_name: resourceName, post_url: postUrl },
    });
    return res.resource_subscription;
  }

  async deleteResourceSubscription(subscriptionId: string) {
    validateId(subscriptionId, "resource subscription");
    const res = await this.request<{ success: boolean }>(
      `/resource_subscriptions/${encodeURIComponent(subscriptionId)}`,
      { method: "DELETE" },
    );
    return res.success;
  }
}

function validateId(id: string, label: string): void {
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    throw new Error(`Invalid ${label} ID: must be a non-empty string`);
  }
  if (!/^[\w\-+=\/]+$/.test(id)) {
    throw new Error(
      `Invalid ${label} ID: "${id}" contains invalid characters`,
    );
  }
}
