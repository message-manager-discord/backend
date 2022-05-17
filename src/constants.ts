//const discordAPIBaseURL = "https://discord.com/api/v9";
const discordAPIBaseURL = "https://discord-proxy.anothercat.workers.dev/api/v9";
const requiredScopes = ["identify", "guilds", "guilds.members.read"];

const embedPink = 12814273;
const successGreen = 3066993;
const failureRed = 15158332;

const inviteUrl =
  "https://discord.com/api/oauth2/authorize?client_id=735395698278924359&permissions=515933326400&scope=bot%20applications.commands";

export {
  discordAPIBaseURL,
  embedPink,
  failureRed,
  inviteUrl,
  requiredScopes,
  successGreen,
};
