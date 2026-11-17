export type ClerkLoadRecoveryStep = "reload" | "clear-session-and-reload" | "give-up";

// clerk-js never retries a failed load(): a startup network blip, a Clerk UI script that did not
// download, or a saved session the server rejects all leave it in "error" until the renderer
// reloads. Reload once, then drop the saved session, then stop so a Clerk outage cannot loop.
export function nextClerkLoadRecoveryStep(failedReloads: number): ClerkLoadRecoveryStep {
  if (failedReloads === 0) return "reload";
  if (failedReloads === 1) return "clear-session-and-reload";
  return "give-up";
}
