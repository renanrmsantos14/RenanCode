import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import { T, useGT, useMessages } from "gt-react";
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
import { useSearchableSetting } from "./settingsSearch";

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
  const searchableSetting = useSearchableSetting();
  const gt = useGT();
  const m = useMessages();
  const [state, setState] = useState<ReleaseHistoryState>({ status: "idle" });

  const load = async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "loaded", releases: await fetchReleases() });
    } catch (error) {
      setState({
        status: "error",
        message: thrownErrorMessage(error, m) ?? gt("Could not load releases"),
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
          ? gt("Could not load releases: {message}", { message: state.message })
          : gt(
              "Published versions of this app. Install the newest one with the Version button above.",
            )
      }
      control={
        <Button
          size="sm"
          variant="outline"
          disabled={state.status === "loading"}
          onClick={() => void load()}
        >
          {state.status === "loading"
            ? gt("Loading…")
            : state.status === "idle"
              ? gt("Show versions")
              : gt("Refresh")}
        </Button>
      }
    >
      {state.status === "loaded" ? (
        state.releases.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            <T>No published releases yet.</T>
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-md border">
            {state.releases.map((release) => (
              <li key={release.version} className="flex items-center gap-2 px-3 py-2 text-xs">
                <code className="font-medium">v{release.version}</code>
                {release.version === APP_VERSION ? (
                  <Badge variant="outline">
                    <T context="the installed app version">Current</T>
                  </Badge>
                ) : null}
                {release.prerelease ? (
                  <Badge variant="secondary">
                    <T>Pre-release</T>
                  </Badge>
                ) : null}
                <span className="ml-auto text-muted-foreground">
                  {release.publishedAt
                    ? releaseDateFormat.format(new Date(release.publishedAt))
                    : null}
                </span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={gt("Open notes for v{version}", { version: release.version })}
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
