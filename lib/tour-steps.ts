export interface TourStep {
  selector: string;
  title: string;
  description: string;
  placement: "top" | "bottom" | "left" | "right";
}

export const TOUR_STEPS: TourStep[] = [
  {
    selector: "[data-tour='new-chat-btn']",
    title: "Start a New Chat",
    description: "Click here anytime to begin a fresh conversation with the AI.",
    placement: "right",
  },
  {
    selector: "[data-tour='model-selector']",
    title: "Choose Your AI Model",
    description: "Select which Claude model to use — faster responses or deeper reasoning, your choice.",
    placement: "bottom",
  },
  {
    selector: "[data-tour='suggestion-chips']",
    title: "Example Prompts",
    description: "Not sure what to ask? Click any of these example prompts to get started instantly.",
    placement: "bottom",
  },
  {
    selector: "[data-tour='mode-selector']",
    title: "Switch Modes",
    description: "Use Email mode to draft professional emails, or Quick Info for fast, direct answers.",
    placement: "top",
  },
  {
    selector: "[data-tour='tone-selector']",
    title: "Set Your Tone",
    description: "Pick a custom tone for your messages — formal, casual, or anything you've configured in Settings.",
    placement: "top",
  },
  {
    selector: "[data-tour='attach-btn']",
    title: "Attach Files",
    description: "Upload images, PDFs, spreadsheets, and documents — up to 20 MB each, up to 5 files.",
    placement: "top",
  },
  {
    selector: "[data-tour='message-input']",
    title: "Type Your Message",
    description: "Ask anything here. Press Enter to send, or Shift+Enter to start a new line.",
    placement: "top",
  },
  {
    selector: "[data-tour='send-btn']",
    title: "Send Your Message",
    description: "Click the arrow button to send, or just press Enter on your keyboard.",
    placement: "top",
  },
  {
    selector: "[data-tour='settings-link']",
    title: "Settings",
    description: "Personalise the AI — set your communication style, signature, and custom tones.",
    placement: "right",
  },
  {
    selector: "[data-tour='capabilities-link']",
    title: "Capabilities",
    description: "See everything the AI can help you with — products, orders, partners, warehouse, and more.",
    placement: "right",
  },
];
