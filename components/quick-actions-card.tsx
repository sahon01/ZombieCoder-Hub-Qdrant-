import Link from "next/link"
import { Bot, Database, FileCode, Terminal } from "lucide-react"

const actions = [
  { name: "View Agents", href: "/agents", icon: Bot },
  { name: "Memory", href: "/memory", icon: Database },
  { name: "Templates", href: "/prompt-templates", icon: FileCode },
  { name: "CLI", href: "/cli-agent", icon: Terminal },
]

export function QuickActionsCard() {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h3 className="text-sm font-medium text-muted-foreground">Quick Actions</h3>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <Link
            key={action.name}
            href={action.href}
            className="flex flex-col items-center gap-2 rounded-md border border-border bg-secondary/50 p-4 transition-colors hover:bg-secondary"
          >
            <action.icon className="h-5 w-5 text-primary" />
            <span className="text-xs font-medium">{action.name}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
