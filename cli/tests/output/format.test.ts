import { describe, it, expect } from "vitest";
import { formatOutput, formatSingle, formatPrice, formatDate, type FormatOptions } from "../../src/output/format.js";

describe("output formatting", () => {
  const columns = [
    { key: "id" as const, label: "ID", width: 10 },
    { key: "name" as const, label: "Name", width: 20 },
    { key: "price" as const, label: "Price", width: 10 },
  ];

  const items = [
    { id: "p1", name: "Product One", price: "$9.99" },
    { id: "p2", name: "Product Two", price: "$19.99" },
  ];

  describe("formatOutput", () => {
    it("returns only IDs in quiet mode", () => {
      const result = formatOutput(items, columns, { quiet: true });
      expect(result).toBe("p1\np2");
    });

    it("returns JSON when json option is true", () => {
      const result = formatOutput(items, columns, { json: true });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe("p1");
      expect(parsed[0].name).toBe("Product One");
    });

    it("filters JSON fields when array is provided", () => {
      const result = formatOutput(items, columns, {
        json: ["id", "name"],
      });
      const parsed = JSON.parse(result);
      expect(parsed[0].id).toBe("p1");
      expect(parsed[0].name).toBe("Product One");
      expect(parsed[0].price).toBeUndefined();
    });

    it("applies jq .[].field expression", () => {
      const result = formatOutput(items, columns, {
        json: true,
        jq: ".[].name",
      });
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(["Product One", "Product Two"]);
    });

    it("applies jq .field expression on arrays", () => {
      const result = formatOutput(items, columns, {
        json: true,
        jq: ".id",
      });
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(["p1", "p2"]);
    });

    it("applies jq identity expression", () => {
      const result = formatOutput(items, columns, {
        json: true,
        jq: ".",
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(2);
    });

    it("applies jq select filter", () => {
      const numericItems = [
        { id: "p1", name: "Cheap", price: 500 },
        { id: "p2", name: "Expensive", price: 5000 },
      ];
      const result = formatOutput(
        numericItems,
        [
          { key: "id" as const, label: "ID" },
          { key: "name" as const, label: "Name" },
          { key: "price" as const, label: "Price" },
        ],
        {
          json: true,
          jq: '.[] | select(.price > 1000)',
        },
      );
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe("Expensive");
    });
  });

  describe("formatSingle", () => {
    it("returns JSON when json option is true", () => {
      const result = formatSingle(
        { id: "p1", name: "Test", description: "A test" },
        [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Desc" },
        ],
        { json: true },
      );
      const parsed = JSON.parse(result);
      expect(parsed.id).toBe("p1");
    });

    it("filters JSON fields when array is provided", () => {
      const result = formatSingle(
        { id: "p1", name: "Test", secret: "hidden" },
        [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
        ],
        { json: ["id"] },
      );
      const parsed = JSON.parse(result);
      expect(parsed.id).toBe("p1");
      expect(parsed.name).toBeUndefined();
      expect(parsed.secret).toBeUndefined();
    });
  });

  describe("formatPrice", () => {
    it("formats cents to dollars", () => {
      expect(formatPrice(999)).toBe("$9.99");
      expect(formatPrice(0)).toBe("$0.00");
      expect(formatPrice(100)).toBe("$1.00");
      expect(formatPrice(49999)).toBe("$499.99");
    });

    it("uses custom symbol", () => {
      expect(formatPrice(999, "€")).toBe("€9.99");
    });
  });

  describe("formatDate", () => {
    it("returns ISO string for invalid dates", () => {
      expect(formatDate("not-a-date")).toBe("not-a-date");
    });

    it("handles valid ISO date strings", () => {
      const result = formatDate("2024-01-15T10:30:00Z");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
