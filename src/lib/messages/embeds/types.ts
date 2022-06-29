interface StoredField {
  name: string; // Max 256 characters
  value: string; // Max 1024 characters
  inline?: boolean;
}

interface StoredEmbed {
  title?: string; // Max 256 characters
  description?: string; // Max 4096 characters
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: {
    text: string; // Max 2048 characters
    icon_url?: string;
  };
  author?: {
    name: string; // Max 256 characters
    url?: string;
    icon_url?: string;
  };
  thumbnail?: {
    url: string; // Max 2048 characters
  };
  fields?: StoredField[]; // Max 25
}

export { StoredEmbed };
