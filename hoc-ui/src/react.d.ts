/* eslint-disable @typescript-eslint/no-empty-object-type */
import "react";

/**
 * Fix React 19 ForwardRefExoticComponent JSX compatibility.
 *
 * React 19 changed the JSX element type signature to `(props: unknown) => ReactNode`,
 * but ForwardRefExoticComponent still uses the old `(props: P) => ReactElement | null`.
 * This augmentation bridges the gap so lucide-react icons and forwardRef UI components
 * can be used as JSX without "cannot be used as a JSX component" errors.
 */
declare module "react" {
  // biome-ignore lint: module augment
  interface FunctionComponent<P = {}> {
    (props: P, context?: unknown): ReactNode;
  }
  // biome-ignore lint: module augment
  interface ForwardRefExoticComponent<P = {}> {
    (props: P): ReactNode;
  }
}
