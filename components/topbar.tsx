import Link from "next/link"
import { Bell, HelpCircle, Settings } from "lucide-react"

export function Topbar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center bg-white text-black font-bold text-sm">U</div>
          <span className="font-semibold">UAS Admin</span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link href="/" className="px-3 py-1.5 text-sm text-foreground hover:text-foreground/80">
            Dashboard
          </Link>
          <Link href="/models" className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
            Models
          </Link>
          <Link href="/ollama-models" className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
            Ollama Models
          </Link>
          <Link href="/agents" className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
            Agents
          </Link>
          <Link href="/servers" className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
            Servers
          </Link>
          <Link href="/memory" className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
            Memory
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <button className="text-muted-foreground hover:text-foreground">
          <HelpCircle className="h-5 w-5" />
        </button>
        <button className="text-muted-foreground hover:text-foreground">
          <Bell className="h-5 w-5" />
        </button>
        <Link href="/settings" className="text-muted-foreground hover:text-foreground">
          <Settings className="h-5 w-5" />
        </Link>
      </div>
    </header>
  )
}
