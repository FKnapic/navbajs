/** Otvara službenu Nextbike/Bajs aplikaciju. Otključavanje i plaćanje nisu dio NavBajsa. */
export function openBajsApp(): void {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) {
    window.location.href = "intent://#Intent;package=de.nextbike;scheme=nextbike;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dde.nextbike;end"
    return
  }
  if (/iPad|iPhone|iPod/i.test(ua)) {
    window.location.href = "https://apps.apple.com/app/id504288371"
    return
  }
  window.open("https://bajs.zagreb.hr", "_blank", "noopener,noreferrer")
}
