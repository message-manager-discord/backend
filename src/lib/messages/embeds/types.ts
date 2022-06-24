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
  footerText?: string;
  authorName?: string;
  fields?: StoredField[]; // Max 25
}

export { StoredEmbed };
