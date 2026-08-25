import { useEffect } from 'react'

export function useReveal(rootSelector = '.tr-root') {
  useEffect(() => {
    const root = document.querySelector(rootSelector)
    if (!root) return

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view')
            io.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.15 },
    )

    root.querySelectorAll('.reveal').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [rootSelector])
}
