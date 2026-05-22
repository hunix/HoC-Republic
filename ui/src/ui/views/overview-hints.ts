// Inline the single constant needed from the gateway protocol to avoid cross-package import errors.
const ConnectErrorDetailCodes = { PAIRING_REQUIRED: "PAIRING_REQUIRED" } as const;

/** Whether the overview should show device-pairing guidance for this error. */
export function shouldShowPairingHint(
  connected: boolean,
  lastError: string | null,
  lastErrorCode?: string | null,
): boolean {
  if (connected || !lastError) {
    return false;
  }
  if (lastErrorCode === ConnectErrorDetailCodes.PAIRING_REQUIRED) {
    return true;
  }
  return lastError.toLowerCase().includes("pairing required");
}
