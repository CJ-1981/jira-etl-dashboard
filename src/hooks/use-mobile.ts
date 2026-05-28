import * as React from "react"

const MOBILE_BREAKPOINT = 768

// @MX:NOTE: isMobile state is SSR-safe (defaults to false on server)
// Initializes from window.innerWidth only on client mount to prevent hydration mismatch
// Fallback: returns false when window is undefined (server-side or during SSR)
// Related: MOBILE_BREAKPOINT constant, setIsMobile updater function
export function useIsMobile() {
  // Start with server-safe default (false) to prevent hydration mismatch
  const [isMobile, setIsMobile] = React.useState<boolean>(false)

  // Initialize from window on client mount only
  React.useEffect(() => {
    const initializeMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    // Set initial value on mount
    initializeMobile()

    // Listen for window resize
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
