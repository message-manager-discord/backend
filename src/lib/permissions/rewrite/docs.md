# Permissions Logic

Point of truth for permissions.

## Permissions

Permissions are stored in integer bitfields.
They're stored in a object in a column in the database.

Server level roles just have an allow bitfield, whereas server level user, and channel role + user permisisons have both allow and deny.

eg

Server:  
{
"roles": {roleId: bitfield},
"users": {userId: {allow: bitfield, deny: bitfield}},
}

channel:  
{
"roles": {roleId: {allow: bitfield, deny: bitfield}},
"users": {userId: {allow: bitfield, deny: bitfield}},
}

Allow takes precedence over deny.

The flow for working out permissions is with bitwise OR:

(in a channel)

1. All role permissions for the user combined
2. User deny
3. User allow
4. Channel role permissions deny
5. Channel role permissions allow
6. Channel user permissions deny
7. Channel user permissions allow

(at the server level)

1. All role permissions for the user combined
2. User deny
3. User allow

Permissions checked using bitwise AND

## Different levels

On different levels there are three states, either inexplicit inherit, explicit deny and explicit allow
Which allows a general approach, with small exceptions
For example:
A user has roles which allow send, edit
On all channels without an explicit permission set for that user / that user's roles (in allow or deny) that user has send, edit
In channel A one of the user's roles allows delete, in that channel the user has send, edit, delete
In channel B one of the user's roles denies send, edit - in that channel the user has no permissions
On all other channels the user has send, edit
