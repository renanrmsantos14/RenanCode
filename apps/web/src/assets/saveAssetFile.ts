export async function saveAssetFile(input: {
  readonly name: string;
  readonly url?: string | undefined;
  readonly file?: Blob | null | undefined;
}): Promise<void> {
  let file = input.file;
  if (!file) {
    if (!input.url) throw new Error("Reconnect to the environment and try again.");
    const response = await fetch(input.url);
    if (!response.ok) throw new Error("The file could not be loaded. Try again.");
    file = await response.blob();
  }
  // Blob downloads keep desktop's custom app scheme from navigating to an external browser.
  const downloadUrl = URL.createObjectURL(file);
  // Scheduled before the click so the URL is revoked even if the click throws.
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 30_000);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = input.name;
  anchor.click();
}
