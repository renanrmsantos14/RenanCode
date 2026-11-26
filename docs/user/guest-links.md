# Guest links

Share a single thread with a teammate in their browser—no account required. Guests see messages and agent activity stream live. By default any message they send waits for your approval before running; turn off **Require my approval** before creating the link to let their messages go straight to the agent.

## Prerequisites and sharing

- Enable **Settings → Labs → Guest links** on the host machine (turning it off pauses all active guest links on that machine).
- Link the host to [T3 Connect](./remote-access.md) and keep it online while the guest uses the link.

1. Open the thread's menu (or command palette / mobile long-press or header menu) and choose **Share with guest**.
2. Send the copied link to one person (works in one browser and expires after 24 hours).
3. With approval on, guest messages appear at the end of the thread (**Request** in the sidebar). Choose **Send** to run as a normal turn (in the thread's current permission mode—review text and files first) or **Dismiss**.

Choose **Stop sharing** anytime to revoke immediately. Archiving the thread, generating a new link, or unlinking T3 Connect also ends the link.

## What guests can see and attach

- **Visible**: Thread messages, files, agent replies, images, reasoning, plans, questions, and command output. Anything the agent printed is visible—only share threads you're comfortable exposing.
- **Restricted**: No diffs, file browser, model switching, forking, reverting, or approving the agent's commands. On a link without **Require my approval**, the guest can also answer the agent's questions, and the answer goes straight to the agent; with approval on, you answer them.
- **Attachments**: Up to 4 files (10 MB total) per message (PNG, JPEG, GIF, WebP images + other files), up to 20 MB total across pending unapproved messages. Dismissing or ending the link deletes pending files.
