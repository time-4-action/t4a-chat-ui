export type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "bullet_list"; items: string[] }
  | { type: "numbered_list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; language?: string; text: string };

export interface DocumentSection {
  heading: string;
  level: 1 | 2 | 3;
  content: ContentBlock[];
}

export interface DocumentData {
  type: "document";
  title: string;
  subtitle?: string;
  author?: string;
  sections: DocumentSection[];
}

export interface SlideData {
  title: string;
  layout: "title-content" | "title-only" | "blank";
  content: ContentBlock[];
}

export interface PresentationData {
  type: "presentation";
  title: string;
  author?: string;
  slides: SlideData[];
}
