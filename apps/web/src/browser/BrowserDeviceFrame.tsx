import type { BrowserDeviceCamera, BrowserDeviceFrame as Frame } from "./browserDeviceFrameLayout";

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Props extends Rect {
  readonly frame: Frame;
  /** Host pixels per device CSS pixel. */
  readonly scale: number;
}

// Device CSS pixels: length along the short edge, depth into the screen, gap from the edge.
const CAMERAS: Record<
  BrowserDeviceCamera,
  {
    readonly along: number;
    readonly across: number;
    readonly offset: number;
    readonly radius: number;
  }
> = {
  island: { along: 124, across: 36, offset: 11, radius: 18 },
  notch: { along: 210, across: 30, offset: 0, radius: 18 },
  "punch-hole": { along: 12, across: 12, offset: 12, radius: 6 },
};

// Positions are fractions of the long edge, from the top of a portrait phone.
const PHONE_BUTTONS = [
  { left: true, at: 0.16, length: 26 },
  { left: true, at: 0.24, length: 52 },
  { left: true, at: 0.33, length: 52 },
  { left: false, at: 0.27, length: 80 },
] as const;
const BUTTON_DEPTH = 3;

/**
 * Static device chrome drawn around the preview screen. Render it before the screen element:
 * the shell sits behind the page and the camera cutout stacks above it.
 */
export function BrowserDeviceFrame({ frame, scale, ...screen }: Props) {
  const bezel = frame.bezel * scale;
  const landscape = screen.width > screen.height;
  return (
    <div aria-hidden="true" className="pointer-events-none" data-browser-device-frame={frame.kind}>
      {frame.kind === "phone"
        ? PHONE_BUTTONS.map((button) => (
            <div
              key={button.at}
              className="absolute rounded-sm bg-device-button"
              style={phoneButtonStyle(button, screen, bezel, scale, landscape)}
            />
          ))
        : null}
      <div
        className="absolute bg-device-frame shadow-device-frame ring-1 ring-device-frame-edge ring-inset"
        style={{
          left: screen.x - bezel,
          top: screen.y - bezel,
          width: screen.width + bezel * 2,
          height: screen.height + bezel * 2,
          borderRadius: frame.screenRadius * scale + bezel,
        }}
      />
      {frame.camera ? (
        <div
          className="absolute z-10 bg-device-frame"
          style={cameraStyle(frame.camera, screen, scale, landscape)}
        />
      ) : null}
    </div>
  );
}

function cameraStyle(camera: BrowserDeviceCamera, screen: Rect, scale: number, landscape: boolean) {
  const shape = CAMERAS[camera];
  const along = Math.min(shape.along * scale, Math.min(screen.width, screen.height) * 0.55);
  const across = shape.across * scale;
  const offset = shape.offset * scale;
  const radius = shape.radius * scale;
  // The notch hangs from the bezel, so only its inner corners are rounded.
  const borderRadius =
    camera !== "notch"
      ? radius
      : landscape
        ? `0 ${radius}px ${radius}px 0`
        : `0 0 ${radius}px ${radius}px`;
  return landscape
    ? {
        left: screen.x + offset,
        top: screen.y + (screen.height - along) / 2,
        width: across,
        height: along,
        borderRadius,
      }
    : {
        left: screen.x + (screen.width - along) / 2,
        top: screen.y + offset,
        width: along,
        height: across,
        borderRadius,
      };
}

// Landscape turns the phone counter-clockwise: the top edge goes left and the left side goes down.
function phoneButtonStyle(
  button: (typeof PHONE_BUTTONS)[number],
  screen: Rect,
  bezel: number,
  scale: number,
  landscape: boolean,
) {
  const length = button.length * scale;
  if (landscape) {
    return {
      left: screen.x + screen.width * button.at,
      top: button.left ? screen.y + screen.height + bezel : screen.y - bezel - BUTTON_DEPTH,
      width: length,
      height: BUTTON_DEPTH,
    };
  }
  return {
    left: button.left ? screen.x - bezel - BUTTON_DEPTH : screen.x + screen.width + bezel,
    top: screen.y + screen.height * button.at,
    width: BUTTON_DEPTH,
    height: length,
  };
}
