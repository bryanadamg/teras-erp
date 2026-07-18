'use client'

import { useEffect } from 'react'

// Registers the service worker so the browser offers PWA install.
// No-op on servers / browsers without SW support.
export default function SWRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failure is non-fatal — app still works, just not installable.
    })
  }, [])
  return null
}
