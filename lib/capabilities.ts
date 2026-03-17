export type CapabilityCategory = {
  id: string;
  label: string;
  navLabel: string;
  icon: string;
  color: string;
  description: string;
  tools: string[];
  examples: string[];   // short clickable queries shown in chat empty state
  prompts: string[];    // detailed feature descriptions shown on /capabilities page
};

export const CAPABILITIES: CapabilityCategory[] = [
  {
    id: "products",
    label: "Product & Inventory Management",
    navLabel: "Products",
    icon: "Package",
    color: "blue",
    description: "Search products, check stock levels, get pricing, view variants, and generate product URLs.",
    tools: ["identify_product", "get_product_price", "get_product_stock", "get_product_url", "get_product_variants"],
    examples: [
      "What is the price of SKU P07210001020?",
      "How much stock do we have for product XYZ?",
      "Show me all variants of the Patrik X board",
    ],
    prompts: [
      "Search products — find any item in the Patrik catalog by name, code, or description",
      "Check stock levels — view real-time availability across all five warehouses (Main, Used Equipment, Transit China, Transit Cobra, Handcarry)",
      "Get pricing — retrieve net/gross prices across all pricelists (RRP 2026, Partner pricing, PP AGENTS tiers, Team pricing)",
      "View product variants — see all sizes, colors, and SKU options for a product family",
      "Generate product URLs — get direct links to items on patrikinternational.com",
    ],
  },
  {
    id: "documents",
    label: "Order & Document Management",
    navLabel: "Orders & Docs",
    icon: "FileText",
    color: "violet",
    description: "Search and retrieve orders, invoices, and all warehouse documents with direct MetaKocka links.",
    tools: ["search_documents_tool", "discover_document_filters", "get_document_tool", "get_document_url"],
    examples: [
      "Show me the latest sales orders",
      "Show details about invoice 131/2026",
      "List purchase orders from last week",
    ],
    prompts: [
      "Search orders & invoices — filter sales orders, purchase orders, bills, credit notes, packing lists, delivery notes, and other warehouse documents by date, customer, status, product, or reference number",
      "Retrieve full documents — fetch complete details including line items, totals, payment status, delivery tracking, and attachments",
      "Generate document links — create direct MetaKocka UI URLs for any order or invoice",
      "View related documents — trace linked packing lists, delivery notes, and sales orders from a single document",
    ],
  },
  {
    id: "partners",
    label: "Customer & Partner Data",
    navLabel: "Partners",
    icon: "Users",
    color: "emerald",
    description: "Look up customers and suppliers by name, tax ID, email, or phone. Check pricing tiers and contact details.",
    tools: ["get_partner_tool", "search_blacklist_partner_tool"],
    examples: [
      "Find contact details for Jibe Wear",
      "Is this email address on the blacklist?",
    ],
    prompts: [
      "Search partners — find customers or suppliers by name, tax ID, email, or phone",
      "View contact details — get addresses, phone numbers, emails, and configured discounts",
      "Check partner pricing tiers — see which pricelist each customer is assigned to",
    ],
  },
  {
    id: "warehouse",
    label: "Warehouse & Logistics",
    navLabel: "Warehouse",
    icon: "Warehouse",
    color: "amber",
    description: "Cross-warehouse stock analysis, bulk product queries, and delivery service pricing.",
    tools: ["get_warehouse_list_tool", "get_warehouse_stock_tool", "search_tracking_code_tool", "get_delivery_service_pricelists_tool"],
    examples: [
      "What is the stock of SKU ABC across all warehouses?",
      "Show GLS delivery price list",
      "List all our warehouses",
    ],
    prompts: [
      "Cross-warehouse stock analysis — query stock across multiple warehouses at once",
      "View warehouse information — see all configured warehouse locations, names, addresses, and status",
      "Bulk product queries — check stock for multiple products simultaneously",
      "Delivery service pricing — retrieve all configured courier price lists with weight brackets and costs",
    ],
  },
  {
    id: "email",
    label: "Email Management",
    navLabel: "Email",
    icon: "Mail",
    color: "rose",
    description: "Search Gmail, read messages and threads, download attachments, and create drafts.",
    tools: ["gmail_search_messages", "gmail_read_message", "gmail_read_thread", "gmail_create_draft", "gmail_list_labels", "gmail_get_profile"],
    examples: [
      "Find emails from Patrik about the order",
      "Show my unread emails from today",
      "Draft a reply to the last email from Jibe Wear",
    ],
    prompts: [
      "Search Gmail — find messages by sender, subject, date, label, or keywords",
      "Read messages — view full email content including body, attachments, and thread history",
      "Read threads — fetch all messages in a conversation",
      "Download attachments — retrieve files from emails with automatic preview/download links",
      "Create drafts — compose new emails (saved to Drafts, not sent automatically)",
      "View profile — check your email address and message/thread counts",
      "List labels — see all your Gmail folders and custom labels",
    ],
  },
  {
    id: "export",
    label: "Data Export & Analysis",
    navLabel: "Export & Analysis",
    icon: "BarChart2",
    color: "sky",
    description: "Export structured data to CSV/TSV, bulk filter large datasets, and cross-reference documents.",
    tools: ["search_documents_tool", "get_warehouse_stock_tool", "get_product_stock"],
    examples: [
      "Export all open invoices from March as CSV",
      "Give me a TSV of stock levels across all warehouses",
    ],
    prompts: [
      "Export to CSV/TSV — provide structured data in downloadable formats",
      "Bulk filtering — retrieve and filter large datasets by multiple criteria (date range, status, product, customer, warehouse)",
      "Cross-reference documents — link invoices to orders, packing lists, and delivery notes",
    ],
  },
  {
    id: "memory",
    label: "Context & Memory",
    navLabel: "Memory",
    icon: "Brain",
    color: "indigo",
    description: "Persistent memory across sessions — work context, preferences, active projects, and past inquiries.",
    tools: [],
    examples: [],
    prompts: [
      "Persistent conversation memory — remembers your work context, preferences, active projects, and past inquiries across sessions",
      "Operational knowledge — maintains awareness of your warehouse infrastructure, pricing structures, open invoices, and product research",
    ],
  },
];

export function getCategoryForTool(toolName: string): CapabilityCategory | undefined {
  return CAPABILITIES.find((c) => c.tools.includes(toolName));
}
