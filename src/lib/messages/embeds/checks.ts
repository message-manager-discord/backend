import { StoredEmbed } from "./types";

// Sum of title, description, field.name, field.value, footer.text, and author.name must not exceed 6000 characters

// Check if an embed exceeds any of the limits
function checkEmbedMeetsLimits(embed: StoredEmbed): boolean {
  let totalCheckableLength = 0;
  // First check if each individual part of the embed exceeds it's limit, only for parts that have their own limits
  if (embed.title !== undefined && embed.title.length > 256) {
    return true;
  }
  totalCheckableLength += embed.title?.length ?? 0;
  if (embed.description !== undefined && embed.description.length > 4096) {
    return true;
  }
  totalCheckableLength += embed.description?.length ?? 0;
  if (embed.footer?.text !== undefined && embed.footer.text.length > 2048) {
    return true;
  }
  totalCheckableLength += embed.footer?.text.length ?? 0;
  if (embed.author?.name !== undefined && embed.author.name.length > 256) {
    return true;
  }
  totalCheckableLength += embed.author?.name.length ?? 0;
  if (embed.fields && embed.fields.length > 25) {
    return true;
  }
  // Also check each field, and ensure it doesn't exceed it's limit
  if (embed.fields) {
    for (const field of embed.fields) {
      if (field.name && field.name.length > 256) {
        return true;
      }
      if (field.value && field.value.length > 1024) {
        return true;
      }
      totalCheckableLength +=
        field.name?.length ?? 0 + field.value?.length ?? 0;
    }
  }
  if (totalCheckableLength > 6000) {
    return true;
  }
  return false;
}

export { checkEmbedMeetsLimits };
