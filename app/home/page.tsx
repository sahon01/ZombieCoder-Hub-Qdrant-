import Link from "next/link"
import { headers } from "next/headers"
import {
  ArrowUpRight,
  Box,
  Image as ImageIcon,
  LayoutGrid,
  LogIn,
  Mic2,
  RefreshCcw,
  Search,
  Sparkles,
  Terminal,
  Video,
} from "lucide-react"

type Plan = {
  id: number
  name: string
  description?: string | null
  duration_days: number
  price_usd: string | number
  features_json?: unknown
}

async function getPlans(): Promise<Plan[]> {
  const h = await headers()
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000"
  const proto = h.get("x-forwarded-proto") || "http"
  const origin = `${proto}://${host}`

  const res = await fetch(`${origin}/api/proxy/plans`, { cache: "no-store" })

  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data?.plans) ? data.plans : []
}

function formatPrice(price: string | number) {
  const n = typeof price === "string" ? Number(price) : price
  if (!Number.isFinite(n)) return ""
  if (n === 0) return "Free"
  return `$${n.toFixed(2)}`
}

export default async function HomePage() {
  const plans = await getPlans()

  return (
    <div className="relative min-h-screen bg-black text-white">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:50px_50px]" />

      <nav className="sticky top-0 z-50 border-b border-white/5 bg-black/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/home" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight">ZombieCoder</span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <Link href="#pricing" className="text-sm text-gray-400 hover:text-white">
              Pricing
            </Link>
            <Link href="#docs" className="text-sm text-gray-400 hover:text-white">
              Documentation
            </Link>
            <Link href="#cases" className="text-sm text-gray-400 hover:text-white">
              Case studies
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/5"
            >
              <LogIn className="h-4 w-4" />
              Get started
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden pb-20 pt-28">
        <div className="mx-auto max-w-7xl px-6 text-center">
          <h1 className="mb-8 text-5xl font-light tracking-tighter leading-none md:text-7xl">
            ZombieCoder
            <br />
            <span className="text-gray-500">Where code speaks</span>
          </h1>

          <p className="mx-auto mb-12 max-w-2xl text-lg font-light text-gray-400 md:text-xl">
            Build reliable, local-first AI workflows. Own your stack, control your data, and ship faster.
          </p>

          <div className="mb-20 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-medium text-black transition-all hover:bg-gray-200"
            >
              <Terminal className="h-4 w-4" />
              Build your first workflow
            </Link>
            <Link
              href="/providers"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/5"
            >
              <LayoutGrid className="h-4 w-4" />
              Explore integrations
            </Link>
          </div>

          <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-white/5 p-1 backdrop-blur">
            <div className="rounded-[22px] bg-black/40 p-12">
              <Sparkles className="mx-auto mb-8 h-16 w-16 text-blue-500 opacity-80" />
              <h2 className="text-3xl font-medium tracking-tight md:text-5xl">
                Go from idea to
                <br />
                <span className="text-blue-400">production-ready tools</span>
              </h2>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t border-white/5 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-12 flex items-end justify-between gap-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-blue-500">Plans</div>
              <h2 className="mt-3 text-3xl font-normal">Choose a plan that fits your team</h2>
              <p className="mt-3 max-w-2xl text-sm text-gray-400">
                Plans are time-based. Your access window is controlled by subscription start/end timestamps.
              </p>
            </div>
          </div>

          {plans.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-sm text-gray-400">
              Plans are not available right now.
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-3">
              {plans.map((p) => (
                <div key={p.id} className="rounded-3xl border border-white/10 bg-white/5 p-8">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-medium">{p.name}</h3>
                      <p className="mt-2 text-sm text-gray-400">{p.description || ""}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold">{formatPrice(p.price_usd)}</div>
                      <div className="mt-1 text-xs text-gray-500">{p.duration_days} days</div>
                    </div>
                  </div>

                  <Link
                    href="/"
                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/20 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/5"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    Request access
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-white/5 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-12 md:grid-cols-2">
            <div className="space-y-6">
              <div className="text-xs font-semibold uppercase tracking-widest text-blue-500">Build AI-first apps</div>
              <h2 className="text-3xl font-normal leading-tight md:text-4xl">
                Add AI features with predictable, testable primitives
              </h2>
              <p className="text-lg font-light leading-relaxed text-gray-400">
                Mix model providers, route requests, and keep observability. No hidden fallbacks.
              </p>
              <Link
                href="/models"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/5"
              >
                <ArrowUpRight className="h-4 w-4" />
                Explore models
              </Link>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
              <div className="space-y-4">
                <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
                  <ImageIcon className="h-5 w-5 text-blue-400" />
                  <span className="text-sm">Image tools ready</span>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm italic text-gray-400">
                  "Create a workflow that monitors servers and summarizes incidents..."
                </div>
                <div className="h-10 w-full animate-pulse rounded-lg bg-blue-500/20" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 py-24" id="cases">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-12 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-neutral-900">
                <div className="flex h-8 items-center gap-2 bg-white/5 px-4">
                  <div className="h-2 w-2 rounded-full bg-red-500/50" />
                  <div className="h-2 w-2 rounded-full bg-yellow-500/50" />
                  <div className="h-2 w-2 rounded-full bg-green-500/50" />
                </div>
                <div className="p-8 text-center">
                  <div className="mb-2 text-4xl font-bold opacity-10">REMIXABLE</div>
                  <div className="flex justify-center gap-2">
                    <RefreshCcw className="h-4 w-4 text-blue-500" />
                    <span className="text-xs text-blue-500">Updating components...</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="text-xs font-semibold uppercase tracking-widest text-blue-500">Deploy and share</div>
              <h2 className="text-3xl font-normal leading-tight md:text-4xl">Remix workflows and publish fast</h2>
              <p className="text-lg font-light leading-relaxed text-gray-400">
                Start from a working baseline and iterate. Make changes without breaking the system.
              </p>
              <Link
                href="/servers"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/5"
              >
                <ArrowUpRight className="h-4 w-4" />
                View infrastructure
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 py-24" id="docs">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="mb-12 text-2xl font-medium">Explore modules</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { name: "ZombieCoder", icon: Sparkles, desc: "Core assistant for reasoning and coding." },
              { name: "Imagen", icon: ImageIcon, desc: "Image generation and editing primitives." },
              { name: "Veo", icon: Video, desc: "Video generation building blocks." },
              { name: "TTS", icon: Mic2, desc: "Natural text-to-speech synthesis." },
              { name: "Gemma", icon: Box, desc: "Open-weight models for research." },
              { name: "Search", icon: Search, desc: "Grounding for real-world information." },
            ].map((m) => (
              <div key={m.name} className="cursor-pointer rounded-3xl border border-white/10 bg-white/5 p-8 transition-all hover:border-white/20">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5">
                  <m.icon className="h-6 w-6 text-gray-400" />
                </div>
                <h3 className="mb-2 text-xl font-medium">{m.name}</h3>
                <p className="text-sm font-light leading-relaxed text-gray-500">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-20 text-center">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-8 flex items-center justify-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-500 to-purple-500">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-semibold">ZombieCoder</span>
          </div>
          <p className="mb-12 text-gray-500">Start building reliable tools with ZombieCoder today.</p>
          <div className="flex flex-wrap justify-center gap-8 text-sm text-gray-500">
            <Link href="#" className="hover:text-white">
              Privacy
            </Link>
            <Link href="#" className="hover:text-white">
              Terms
            </Link>
            <Link href="#docs" className="hover:text-white">
              Documentation
            </Link>
            <Link href="#pricing" className="hover:text-white">
              Plans
            </Link>
          </div>
          <div className="mt-16 text-xs text-gray-700">© 2026 ZombieCoder. Built for local-first workflows.</div>
        </div>
      </footer>
    </div>
  )
}
