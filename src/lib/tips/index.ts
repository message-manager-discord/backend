// Tips appear at the bottom of embeds
// There can be more than one, and it will be random

import { APIEmbed } from "discord-api-types/v9";
import { allTips } from "./tips";

// Chance of any tip happening
const allTipChance = 0.5;

interface Tip {
  message: string;
}

function selectTip(): Tip | null {
  const random = Math.random();
  if (random > allTipChance) {
    return null;
  }
  return allTips[Math.floor(Math.random() * allTips.length)];
}

function addTipToEmbed(embed: APIEmbed): APIEmbed {
  const tip = selectTip();
  if (tip) {
    return {
      ...embed,
      footer: {
        text: `Tip! ${tip.message}`,
      },
    };
  }
  return embed;
}
export { selectTip, addTipToEmbed, Tip };
