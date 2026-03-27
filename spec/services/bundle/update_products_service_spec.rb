# frozen_string_literal: true

require "spec_helper"

describe Bundle::UpdateProductsService do
  describe "#perform" do
    let(:seller) { create(:named_seller, :eligible_for_service_products) }
    let(:bundle) { create(:product, user: seller, price_cents: 2000, is_bundle: true, native_type: Link::NATIVE_TYPE_BUNDLE) }

    it "skips already-deleted bundle products instead of re-validating them" do
      stale_product = create(:product, user: seller)
      stale_bp = create(:bundle_product, bundle:, product: stale_product)
      stale_bp.update_column(:deleted_at, Time.current)

      # Product gains variants after being removed from bundle
      category = create(:variant_category, link: stale_product)
      create_list(:variant, 2, variant_category: category)

      new_product = create(:product, user: seller)

      expect do
        described_class.new(
          bundle:,
          products: [{ product_id: new_product.external_id, quantity: 1, position: 0 }]
        ).perform
      end.not_to raise_error

      expect(bundle.reload.bundle_products.alive.pluck(:product_id)).to eq([new_product.id])
    end

    it "soft-deletes alive bundle products when removed from the bundle" do
      product_a = create(:product, user: seller)
      product_b = create(:product, user: seller)
      create(:bundle_product, bundle:, product: product_a)
      create(:bundle_product, bundle:, product: product_b)

      described_class.new(
        bundle:,
        products: [{ product_id: product_a.external_id, quantity: 1, position: 0 }]
      ).perform

      expect(bundle.reload.bundle_products.alive.pluck(:product_id)).to eq([product_a.id])
      expect(bundle.bundle_products.deleted.pluck(:product_id)).to include(product_b.id)
    end

    it "restores a previously deleted bundle product when re-added" do
      product = create(:product, user: seller)
      deleted_bp = create(:bundle_product, bundle:, product:)
      deleted_bp.update_column(:deleted_at, Time.current)

      expect do
        described_class.new(
          bundle:,
          products: [{ product_id: product.external_id, quantity: 1, position: 0 }]
        ).perform
      end.not_to change(BundleProduct, :count)

      expect(deleted_bp.reload).to be_alive
    end
  end
end
