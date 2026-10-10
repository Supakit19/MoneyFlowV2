/** The normal website always completes login in the web workspace, never LIFF Pocket. */
export function websiteDestinationAfterLogin(onboardingState: string | null | undefined) {
  return onboardingState === 'pending' ? '/welcome' : '/dashboard';
}

/** A non-LIFF browser must use the website login flow rather than Pocket. */
export function websiteFallbackForPocket(isInClient: boolean): '/login' | null {
  return isInClient ? null : '/login';
}
