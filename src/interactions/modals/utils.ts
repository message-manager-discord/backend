const parseTags = (tags: string): string[] =>
  tags
    .replace(/\s/g, "") // Remove blankspace
    .toLowerCase() // Default to lowercase
    .split(",") // Split by comma
    .filter((tag) => tag !== ""); // Remove empty tags (for example if there was a comma on the end)

export { parseTags };
