# Todo

- respond to report modal
- fix internal log - system, align with redis-cache?

- When http-errors and prisma use modules remove the weird import style

- setup some kinda of thing checking if the gateway is up

- listen to gateway delete events for message deletions

- rework report info message

- correct link from login after report

- add api for reports (to facilitate admin only dashboard)

  - add blocking users from reporting
  - add blocking guilds as an action from reporting
  - add dms on report update
  - add user portal for tickets etc
  - webhook (integrate with logging?)

  - Staff only messages?
  - ability to request help?
  - only show tickets that need attention (ie not ones waiting on a response)

- add helpers to get user, emoji, role, channel, etc format.

- Remove role from config when role deleted

- Consider increasing state timeout time

- is a remember me checkbox required for cookie consent

- handle deleted messages when delete events are received and when they are not

// Logging for permission changes
// Consistent updates for permission managing embed
// Move permission checks for permissions to the logic
// Add permission presets
// Add permission tag to /info cmd

\\\\\

DEFER if adding command on actions
DEFER ALL COMMANDS THAT MAKE API REQUESTS
