"use client"

import { useMemo, useState } from "react"
import { Download, ExternalLink, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Quant = "Q2" | "Q3" | "Q4" | "Q5" | "Q6" | "Q8"

type GGUFModel = {
  id: string
  name: string
  family: string
  params: string
  quant: Quant
  sizeGB: number
  minRamGB: number
  license: string
  hfUrl: string
  note?: string
}

const curated: GGUFModel[] = [
  {
    id: "qwen2.5-coder-1.5b-q4",
    name: "Qwen2.5-Coder 1.5B (GGUF)",
    family: "Qwen2.5",
    params: "1.5B",
    quant: "Q4",
    sizeGB: 1.1,
    minRamGB: 4,
    license: "Apache-2.0",
    hfUrl: "https://huggingface.co/search/full-text?q=Qwen2.5-Coder%201.5B%20GGUF",
    note: "Great low-resource starting point for coding assistance.",
  },
  {
    id: "llama-3.2-3b-q4",
    name: "Llama 3.2 3B Instruct (GGUF)",
    family: "Llama",
    params: "3B",
    quant: "Q4",
    sizeGB: 2.0,
    minRamGB: 6,
    license: "Llama",
    hfUrl: "https://huggingface.co/search/full-text?q=Llama%203.2%203B%20Instruct%20GGUF",
    note: "Useful for general chat and mixed-language conversations.",
  },
  {
    id: "phi-3.5-mini-q4",
    name: "Phi-3.5 Mini Instruct (GGUF)",
    family: "Phi",
    params: "3.8B",
    quant: "Q4",
    sizeGB: 2.3,
    minRamGB: 6,
    license: "MIT",
    hfUrl: "https://huggingface.co/search/full-text?q=Phi-3.5%20Mini%20Instruct%20GGUF",
    note: "Fast responses on low RAM; good for tool-using workflows.",
  },
  {
    id: "mistral-7b-instruct-q4",
    name: "Mistral 7B Instruct (GGUF)",
    family: "Mistral",
    params: "7B",
    quant: "Q4",
    sizeGB: 4.1,
    minRamGB: 10,
    license: "Apache-2.0",
    hfUrl: "https://huggingface.co/search/full-text?q=Mistral%207B%20Instruct%20GGUF",
    note: "If you have more RAM available, quality improves significantly.",
  },
  {
    id: "gemma-2-2b-it-q4",
    name: "Gemma 2 2B IT (GGUF)",
    family: "Gemma",
    params: "2B",
    quant: "Q4",
    sizeGB: 1.6,
    minRamGB: 5,
    license: "Gemma",
    hfUrl: "https://huggingface.co/search/full-text?q=Gemma%202%202B%20IT%20GGUF",
    note: "Lightweight option for a general assistant.",
  },
]

export default function GGUFModelsPage() {
  const [q, setQ] = useState("")

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return curated

    return curated.filter((m) => {
      const hay = [m.name, m.family, m.params, m.quant, m.license, m.note].filter(Boolean).join(" ").toLowerCase()
      return hay.includes(query)
    })
  }, [q])

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">GGUF Models</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Curated open-source GGUF quantized models from Hugging Face for low-resource setups.
          </p>
        </div>

        <div className="w-full sm:w-[360px]">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search (family, params, quant, license...)"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">No models matched your search.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <div key={m.id} className="rounded-lg border border-border bg-card p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{m.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {m.family} · {m.params} · {m.quant}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {m.sizeGB.toFixed(1)} GB
                </span>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Min RAM</span>
                  <span className="font-mono text-xs">~{m.minRamGB} GB</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">License</span>
                  <span className="font-mono text-xs">{m.license}</span>
                </div>
              </div>

              {m.note ? <p className="mt-4 text-xs text-muted-foreground">{m.note}</p> : null}

              <div className="mt-4 flex gap-2">
                <Button asChild variant="outline" size="sm" className="flex-1 bg-transparent">
                  <a href={m.hfUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-3 w-3" />
                    Hugging Face
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-transparent"
                  onClick={() => navigator.clipboard.writeText(m.hfUrl)}
                >
                  <Download className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 rounded-lg border border-border bg-card p-6">
        <h3 className="text-sm font-medium">llama.cpp tips</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Select provider type <code className="font-mono">llama_cpp</code> and set the endpoint (example:
            <code className="ml-1 font-mono">http://127.0.0.1:8080</code>).
          </li>
          <li>
            Use the Providers page Test button to check connectivity (it will try <code className="font-mono">/v1/models</code> or
            <code className="ml-1 font-mono">/models</code>).
          </li>
          <li>Estimate disk space and RAM before downloading large models.</li>
        </ul>
      </div>
    </div>
  )
}
