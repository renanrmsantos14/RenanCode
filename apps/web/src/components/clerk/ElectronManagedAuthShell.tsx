import { passkeys } from "@clerk/electron/passkeys";
import { ClerkFailed, ClerkLoaded, ClerkProvider } from "@clerk/electron/react";
import { useEffect, type ReactNode } from "react";

import { ManagedRelayAuthProvider } from "../../cloud/managedAuth";
import { clerkAppearance } from "./clerkAppearance";
import { nextClerkLoadRecoveryStep } from "./clerkLoadRecovery";

const CLERK_CLIENT_JWT_KEY = "__clerk_client_jwt";
const FAILED_RELOADS_KEY = "t3code:clerk-load-failed-reloads";
const RETRY_DELAY_MS = 3_000;

declare global {
  interface Window {
    readonly __clerk_internal_electron?: {
      readonly tokenCache: { readonly clearToken: (key: string) => Promise<void> };
    };
  }
}

function ClerkLoadRecovery() {
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- schedules a renderer reload, waiting for the network first
  useEffect(() => {
    const failedReloads = Number(sessionStorage.getItem(FAILED_RELOADS_KEY) ?? 0);
    const step = nextClerkLoadRecoveryStep(failedReloads);
    if (step === "give-up") return;
    let timer: number | undefined;
    const recover = async () => {
      sessionStorage.setItem(FAILED_RELOADS_KEY, String(failedReloads + 1));
      if (step === "clear-session-and-reload") {
        await window.__clerk_internal_electron?.tokenCache
          .clearToken(CLERK_CLIENT_JWT_KEY)
          .catch(() => undefined);
      }
      window.location.reload();
    };
    const schedule = () => {
      timer = window.setTimeout(() => void recover(), RETRY_DELAY_MS);
    };
    if (navigator.onLine) schedule();
    else window.addEventListener("online", schedule, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", schedule);
    };
  }, []);
  return null;
}

function ClerkLoadRecoveryReset() {
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clears the reload budget in sessionStorage once Clerk loads
  useEffect(() => sessionStorage.removeItem(FAILED_RELOADS_KEY), []);
  return null;
}

/** Load only lazily inside desktop; clerk-js is statically bundled and would otherwise enter every
 * client's startup graph. */
export default function ElectronManagedAuthShell({
  publishableKey,
  children,
}: {
  readonly publishableKey: string;
  readonly children: ReactNode;
}) {
  return (
    <ClerkProvider appearance={clerkAppearance} publishableKey={publishableKey} passkeys={passkeys}>
      <ClerkFailed>
        <ClerkLoadRecovery />
      </ClerkFailed>
      <ClerkLoaded>
        <ClerkLoadRecoveryReset />
      </ClerkLoaded>
      <ManagedRelayAuthProvider>{children}</ManagedRelayAuthProvider>
    </ClerkProvider>
  );
}
