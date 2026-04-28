import { ServerHealthCard } from "@/components/server-health-card"
import { SystemStatusCard } from "@/components/system-status-card"
import { QuickActionsCard } from "@/components/quick-actions-card"
import { MetricsCards } from "@/components/metrics-cards"

export default function DashboardPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-sm text-neutral-400">Monitor and manage your Unified Agent System</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <ServerHealthCard />
        <SystemStatusCard />
        <QuickActionsCard />
      </div>

      <div className="mt-8">
        <MetricsCards />
      </div>
    </div>
  )
}
