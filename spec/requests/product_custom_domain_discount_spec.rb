# frozen_string_literal: true

require "spec_helper"

describe "Product custom domain discount code routes", type: :request do
  let(:seller) { create(:named_seller) }
  let(:product) { create(:product, user: seller, unique_permalink: "demo", price_cents: 1000) }
  let!(:custom_domain) { create(:custom_domain, :with_product, domain: "example.com", product:) }

  before do
    allow(CustomDomain).to receive(:find_by_host).with("example.com").and_return(custom_domain)
  end

  describe "GET /:code" do
    it "routes the discount code to the product page" do
      get "/LAUNCH", headers: { "HOST" => "example.com" }
      expect(response).to be_successful
      expect(response.headers["X-Robots-Tag"]).to eq("noindex")
    end
  end

  describe "GET /l/:id/:code" do
    it "routes the permalink and discount code to the product page" do
      get "/l/#{product.unique_permalink}/LAUNCH", headers: { "HOST" => "example.com" }
      expect(response).to be_successful
      expect(response.headers["X-Robots-Tag"]).to eq("noindex")
    end
  end

  describe "GET /l/:id" do
    it "routes the permalink to the product page" do
      get "/l/#{product.unique_permalink}", headers: { "HOST" => "example.com" }
      expect(response).to be_successful
    end
  end

  describe "GET /offer_codes/compute_discount" do
    let!(:offer_code) { create(:percentage_offer_code, products: [product], code: "LAUNCH", amount_percentage: 50) }

    it "computes the discount on a product custom domain" do
      get "/offer_codes/compute_discount",
        params: { code: "LAUNCH", products: { product.unique_permalink => { permalink: product.unique_permalink, quantity: 1 } } },
        headers: { "HOST" => "example.com" }
      expect(response).to be_successful
    end
  end
end
