'use client'

import { useTheme } from 'next-themes'
import { useState, useEffect } from 'react'
import Image from 'next/image'

export function Header() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const logoSrc = mounted && resolvedTheme === 'dark' ? '/imacx_neg.svg' : '/imacx_pos.svg'

  return (
    <div className="flex justify-end items-center px-6 py-4 sticky top-0 z-10 bg-background imx-border-b">
      <Image
        src={logoSrc}
        alt="IMACX"
        width={120}
        height={30}
        style={{ display: 'block', maxWidth: '120px', height: 'auto' }}
        priority
      />
    </div>
  )
}
