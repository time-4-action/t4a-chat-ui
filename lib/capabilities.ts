export type CapabilityCategory = {
  id: string;
  label: string;
  icon: string;
  color: string;
  description: string;
  tools: string[];
  prompts: string[];
};

export const CAPABILITIES: CapabilityCategory[] = [
  {
    id: "products",
    label: "Products",
    icon: "Package",
    color: "blue",
    description: "Search products by name or description, get prices, stock levels, variants, and webshop URLs by SKU.",
    tools: ["identify_product", "get_product_price", "get_product_stock", "get_product_url", "get_product_variants"],
    prompts: [
      "What is the price of SKU P07210001020?",
      "How much stock do we have for product XYZ?",
      "Show me all variants of [product name]",
    ],
  },
  {
    id: "documents",
    label: "Orders & Documents",
    icon: "FileText",
    color: "violet",
    description: "Search and retrieve sales orders, invoices, purchase orders, warehouse docs, offers, and more. Get direct MetaKocka links.",
    tools: ["search_documents_tool", "discover_document_filters", "get_document_tool", "get_document_url"],
    prompts: [
      "Show me the latest sales order",
      "Show details about invoice 131/2026",
      "List purchase orders from last week",
    ],
  },
  {
    id: "partners",
    label: "Partners",
    icon: "Users",
    color: "emerald",
    description: "Look up customers and suppliers by name, email, tax number, or phone. Check the blacklist before accepting new orders.",
    tools: ["get_partner_tool", "search_blacklist_partner_tool"],
    prompts: [
      "Find contact details for Jibe Wear",
      "Is this email address on the blacklist?",
    ],
  },
  {
    id: "warehouse",
    label: "Warehouse",
    icon: "Warehouse",
    color: "amber",
    description: "Check stock levels across all warehouses for one or many products, including reserved and free quantities.",
    tools: ["get_warehouse_list_tool", "get_warehouse_stock_tool"],
    prompts: [
      "List all our warehouses",
      "What is the stock of SKU ABC across all warehouses?",
    ],
  },
  {
    id: "delivery",
    label: "Delivery",
    icon: "Truck",
    color: "rose",
    description: "Find orders by carrier tracking code and view delivery service price lists by weight and service type.",
    tools: ["search_tracking_code_tool", "get_delivery_service_pricelists_tool"],
    prompts: [
      "Show details about invoice 131/2026",
      "Show GLS delivery price list",
    ],
  },
];

export function getCategoryForTool(toolName: string): CapabilityCategory | undefined {
  return CAPABILITIES.find((c) => c.tools.includes(toolName));
}
