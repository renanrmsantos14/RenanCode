import { ExternalLinkIcon } from "lucide-react";
import { useState } from "react";

import { APP_VERSION } from "../../branding";
import {
  type DesktopReleaseSummary,
  getDesktopReleaseListApiUrl,
  parseDesktopReleaseList,
} from "../desktopUpdate.logic";
import { openDesktopUpdateReleaseNotes } from "../desktopUpdate.toast";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

type ReleaseHistoryState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "loaded"; readonly releases: readonly DesktopReleaseSummary[] };

const releaseDateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

async function fetchReleases() {
  const response = await fetch(getDesktopReleaseListApiUrl(), {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`GitHub responded ${response.status}`);
  return parseDesktopReleaseList(await response.json());
}

export function ReleaseHistorySettingsRow() {
  const [state, setState] = useState<ReleaseHistoryState>({ status: "idle" });

  const load = async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "loaded", releases: await fetchReleases() });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not load releases",
      });
    }
  };

  const openRelease = (url: string) => {
    if (window.desktopBridge) {
      void openDesktopUpdateReleaseNotes(window.desktopBridge, url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <SettingsRow
      {...searchableSetting("release-history")}
      description={
        state.status === "error"
          ? `Could not load releases: ${state.message}`
          : "Published versions of this app. Install the newest one with the Version button above."
      }
      control={
        <Button
          size="sm"
          variant="outline"
          disabled={state.status === "loading"}
          onClick={() => void load()}
        >
          {state.status === "loading"
            ? "Loading…"
            : state.status === "idle"
              ? "Show versions"
              : "Refresh"}
        </Button>
      }
    >
      {state.status === "loaded" ? (
        state.releases.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">No published releases yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-md border">
            {state.releases.map((release) => (
              <li key={release.version} className="flex items-center gap-2 px-3 py-2 text-xs">
                <code className="font-medium">v{release.version}</code>
                {release.version === APP_VERSION ? <Badge variant="outline">Current</Badge> : null}
                {release.prerelease ? <Badge variant="secondary">Pre-release</Badge> : null}
                <span className="ml-auto text-muted-foreground">
                  {release.publishedAt
                    ? releaseDateFormat.format(new Date(release.publishedAt))
                    : null}
                </span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Open notes for v${release.version}`}
                  onClick={() => openRelease(release.url)}
                >
                  <ExternalLinkIcon aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </SettingsRow>
  );
}
