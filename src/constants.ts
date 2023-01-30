// Base url for making API requests to discord (other than through the discord.js client)
const discordAPIBaseURL = "https://discord.com/api/v9";
// Scopes to request and require in the oauth2 flow
// identify to be able to identify the user
// guilds to be able to get the guilds the user is in
// and guilds.members.read to access the member object for the user in each guild
const requiredScopes = ["identify", "guilds", "guilds.members.read"];

// Integer color numbers for embed generation
const embedPink = 12814273;
const successGreen = 3066993;
const failureRed = 15158332;

// Url to invite the bot to a server - must be done by a user
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
