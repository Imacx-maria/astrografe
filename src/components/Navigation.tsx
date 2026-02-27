'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { UploadCloud, Search, Settings, Sun, Moon, PanelLeft, PanelLeftClose } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { title: 'Search', href: '/search', icon: Search },
  { title: 'Ingest', href: '/ingest', icon: UploadCloud },
  { title: 'Settings', href: '/settings', icon: Settings },
]

export function Navigation() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [collapsed, setCollapsed] = useState(true)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isActive = (href: string) => pathname === href

  return (
    <div
      className={cn(
        'flex h-screen flex-col imx-border-r bg-background text-foreground transition-all duration-300 flex-shrink-0 relative z-10',
        collapsed ? 'w-16' : 'w-56',
      )}
      style={{ minWidth: collapsed ? '64px' : '224px', maxWidth: collapsed ? '64px' : '224px' }}
      onMouseLeave={() => setCollapsed(true)}
    >
      {/* Toggle button */}
      <div className="flex h-16 items-center justify-end px-4 imx-border-b">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map(({ title, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 transition-colors',
              collapsed ? 'justify-center' : '',
              isActive(href)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
            title={collapsed ? title : undefined}
          >
            <Icon className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>{title}</span>}
          </Link>
        ))}
      </nav>

      {/* Footer — theme toggle */}
      <div className="p-2 imx-border-t">
        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={cn(
              'flex items-center gap-3 px-3 py-2 w-full text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
              collapsed ? 'justify-center' : '',
            )}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5 flex-shrink-0" />
            ) : (
              <Moon className="h-5 w-5 flex-shrink-0" />
            )}
            {!collapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
          </button>
        )}
      </div>
    </div>
  )
}
