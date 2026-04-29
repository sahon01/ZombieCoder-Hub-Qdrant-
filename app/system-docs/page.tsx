export const dynamic = "force-dynamic";

function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="scroll-mt-24 text-xl font-semibold tracking-tight">
      {children}
    </h2>
  );
}

function SubTitle({ children }: { children: string }) {
  return <h3 className="text-base font-semibold tracking-tight">{children}</h3>;
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/50 p-4 text-xs leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function Pill({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

export default function SystemDocsPage() {
  const toc: Array<{ id: string; title: string }> = [
    { id: "goal", title: "Goal (আপনার মূল চাহিদা)" },
    { id: "chain", title: "End-to-End Chain (Provider → UI)" },
    { id: "provider-contract", title: "Provider Contract (ইনপুট/আউটপুট)" },
    { id: "streaming", title: "Streaming Contract (SSE default + HTTP fallback)" },
    { id: "tools", title: "Tool Calling Contract (JSON tool_call)" },
    { id: "memory-rag", title: "Memory + Vector DB (RAG)" },
    { id: "admin-observability", title: "Admin Monitoring + Audit Logs" },
    { id: "module-tests", title: "Module-wise Tests (Student/Teacher Debug Flow)" },
    { id: "source-of-truth", title: "Source-of-Truth Files (বর্তমান authoritative কোড)" },
    { id: "verification", title: "Verification Checklist (আপনি কোড চেক করবেন)" },
  ];

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">System Documentation (Provider → Tools → Memory → Vector DB → Admin)</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          এই পেজটি আপনার বলা “পুরো চেইন” কে এক জায়গায় আনছে: Provider থেকে শুরু করে tool-call, memory, RAG, streaming,
          audit/monitoring এবং admin UI পর্যন্ত। উদ্দেশ্য: আপনি যেন student/teacher স্টাইলে এক নজরে বুঝতে পারেন
          কোথায় পড়া হয়েছে, কোথায় হয়নি, কোথায় আটকে গেছে।
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill>DB-first secrets</Pill>
          <Pill>SSE streaming</Pill>
          <Pill>HTTP fallback</Pill>
          <Pill>Tool-call JSON</Pill>
          <Pill>RAG/Qdrant</Pill>
          <Pill>Admin observability</Pill>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className="h-fit rounded-xl border border-border bg-background p-4 lg:sticky lg:top-6">
          <div className="text-sm font-semibold">Table of Contents</div>
          <div className="mt-3 grid gap-2 text-sm">
            {toc.map((t) => (
              <a key={t.id} href={`#${t.id}`} className="text-muted-foreground hover:text-foreground">
                {t.title}
              </a>
            ))}
          </div>
        </aside>

        <main className="space-y-10">
          <section className="space-y-3">
            <SectionTitle id="goal">Goal (আপনার মূল চাহিদা)</SectionTitle>
            <div className="space-y-2 text-sm leading-6">
              <div>
                সিস্টেমের লক্ষ্য হলো user-এর natural language input কে একটি deterministic process এ convert করে:
              </div>
              <div className="space-y-1 pl-4">
                <div>1) Provider model বুঝবে কখন tool লাগবে</div>
                <div>2) Model tool-call করবে একটি strict format এ</div>
                <div>3) Tool result আসবে</div>
                <div>4) Model final answer দেবে user-friendly text এ</div>
                <div>5) সবকিছু audit/log হবে (success/fail, latency, traces)</div>
              </div>
              <div>
                এর ফলে “মাউস ক্লিক/কিবোর্ড টাইপ” এর মতো কাজগুলো indirect হলেও একইভাবে measurable এবং testable হবে।
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle id="chain">End-to-End Chain (Provider → UI)</SectionTitle>
            <div className="space-y-3 text-sm leading-6">
              <SubTitle>High-level chain</SubTitle>
              <CodeBlock>
                {[
                  "(A) UI: user input",
                  "  ↓",
                  "(B) Server Route: /chat/stream (SSE) বা /chat/message (HTTP)",
                  "  ↓",
                  "(C) ProviderGateway: active provider resolve + prompt build + stream",
                  "  ↓",
                  "(D) Provider Adapter: (ollama/google/llama.cpp/openai-compatible)",
                  "  ↓",
                  "(E) Model output → tool-call parsing/execution (যদি applicable)",
                  "  ↓",
                  "(F) Final answer → persistence (messages/conversations) + audit logs",
                  "  ↓",
                  "(G) UI renders stream chunks + final",
                ].join("\n")}
              </CodeBlock>

              <SubTitle>What is “truth” in this chain?</SubTitle>
              <div>
                Truth মানে এমন state/trace যা মিথ্যা বলতে পারে না: request id, timestamps, provider response codes,
                tool inputs/outputs, and deterministic logs. এইগুলো ছাড়া “পড়া হয়েছে” বলা হলেও teacher verify করতে পারবেন না।
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle id="provider-contract">Provider Contract (ইনপুট/আউটপুট)</SectionTitle>
            <div className="space-y-3 text-sm leading-6">
              <SubTitle>Provider must have (admin-configurable)</SubTitle>
              <div className="space-y-1 pl-4">
                <div>1) Provider type: openai / google(gemini) / ollama / llama_cpp / custom</div>
                <div>2) Endpoint (যদি প্রয়োজন হয়)</div>
                <div>3) Default model (system setting বা provider config)</div>
                <div>4) Timeout + prefer_streaming (system/provider level override)</div>
                <div>5) Secrets resolution: DB/admin store first → env fallback</div>
              </div>

              <SubTitle>Secrets resolution policy (mandatory)</SubTitle>
              <CodeBlock>
                {[
                  "resolve_api_key(providerId, providerConfig):",
                  "  1) DB: system_settings['provider_api_key_PROVIDER_ID'] (encrypted) যদি থাকে → decrypt করে use",
                  "  2) providerConfig.apiKeyEnvVar যদি থাকে → process.env[apiKeyEnvVar]",
                  "  3) fallback env: OLLAMA_CLOUD_API_KEY / OLLAMA_API_KEY / GOOGLE_GEMINI_API_KEY / GOOGLE_API_KEY",
                  "  4) না পেলে: fail fast (clear error)",
                ].join("\n")}
              </CodeBlock>

              <SubTitle>Provider response format (minimum expectation)</SubTitle>
              <div className="space-y-1 pl-4">
                <div>1) Non-stream response: plain text content (assistant answer)</div>
                <div>2) Stream response: incremental text chunks OR SSE delta content (OpenAI-compatible)</div>
                <div>3) Errors: status + message preserved in logs and surfaced to admin</div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle id="streaming">Streaming Contract (SSE default + HTTP fallback)</SectionTitle>
            <div className="space-y-3 text-sm leading-6">
              <SubTitle>Server SSE envelope (what UI receives)</SubTitle>
              <CodeBlock>
                {[
                  "SSE event: data: { type: 'start' | 'chunk' | 'complete' | 'end' | 'error', ... }",
                  "- start: stream শুরু হয়েছে",
                  "- chunk: partial text",
                  "- complete: fullResponse",
                  "- end: typing indicator / cleanup",
                  "- error: error + message",
                ].join("\n")}
              </CodeBlock>

              <SubTitle>Default = SSE</SubTitle>
              <div>
                Default transport SSE হবে যাতে UI real-time progress দেখাতে পারে।
              </div>

              <SubTitle>Fallback = HTTP</SubTitle>
              <div>
                যদি SSE fail হয় (network/proxy/browser limit), UI একই input দিয়ে non-stream endpoint hit করবে
                এবং final JSON response নিবে।
              </div>

              <SubTitle>What to log for truth</SubTitle>
              <div className="space-y-1 pl-4">
                <div>1) requestId</div>
                <div>2) startedAt / endedAt / durationMs</div>
                <div>3) transport: sse | http | ws</div>
                <div>4) providerId/providerType/model</div>
                <div>5) success/fail + upstream status code</div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle id="tools">Tool Calling Contract (JSON tool_call)</SectionTitle>
            <div className="space-y-3 text-sm leading-6">
              <SubTitle>Strict tool-call format (recommended)</SubTitle>
              <CodeBlock>
                {[
                  "```json",
                  "{",
                  "  \"type\": \"tool_call\",",
                  "  \"tool\": \"<tool_name>\",",
                  "  \"input\": \"<string input>\"",
                  "}",
                  "```",
                ].join("\n")}
              </CodeBlock>

              <SubTitle>Tool execution truth signals</SubTitle>
              <div className="space-y-1 pl-4">
                <div>1) tool name + normalized args</div>
                <div>2) input snapshot (bounded size)</div>
                <div>3) output snapshot (bounded size)</div>
                <div>4) error stack/message</div>
                <div>5) latency per tool</div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle id="memory-rag">Memory + Vector DB (RAG)</SectionTitle>
            <div className="space-y-3 text-sm leading-6">
              <SubTitle>Memory layers</SubTitle>
              <div className="space-y-1 pl-4">
                <div>1) Conversation DB (messages table) = audit trail</div>
                <div>2) Agent/session memory buffer = short-term context</div>
                <div>3) Vector DB (Qdrant) = long-term retrieval context</div>
              </div>

              <SubTitle>RAG injection rule</SubTitle>
              <CodeBlock>
                {[
                  "If RAG_ENABLED=true:",
                  "  retrieveContext(userPrompt, topK)",
                  "  append to finalPrompt as [RAG_CONTEXT] block",
                  "  send to provider",
                ].join("\n")}
              </CodeBlock>

              <SubTitle>Admin must show</SubTitle>
              <div className="space-y-1 pl-4">
                <div>1) Qdrant running/health</div>
                <div>2) indexing progress</div>
                <div>3) collection stats + storage</div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle id="admin-observability">Admin Monitoring + Audit Logs</SectionTitle>
            <div className="space-y-3 text-sm leading-6">
              <SubTitle>Minimum observability requirements</SubTitle>
              <div className="space-y-1 pl-4">
                <div>1) Provider connectivity status</div>
                <div>2) Active requests counter + last request timestamp</div>
                <div>3) Success/failure logs separated</div>
                <div>4) Tool-call trace per request</div>
                <div>5) Model latency + token-like counters (যদি available)</div>
              </div>

              <SubTitle>Log separation (proof)</SubTitle>
              <div>
                প্রতিটি সার্ভারে success/fail আলাদা audit trail থাকবে (DB table বা file) যাতে পরে “প্রমাণ” হারিয়ে না যায়।
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle id="module-tests">Module-wise Tests (Student/Teacher Debug Flow)</SectionTitle>
            <div className="space-y-3 text-sm leading-6">
              <SubTitle>Teacher প্রশ্ন করলে student কী দেখাবে?</SubTitle>
              <div className="space-y-2">
                <div className="rounded-lg border border-border p-4">
                  <div className="text-sm font-semibold">Step 1: Provider test</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Admin → Cloud Providers → Test ক্লিক → responseTime + statusCode। Fail হলে: কোন URL hit হয়েছে, কোন key resolve হয়েছে (redacted)।
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4">
                  <div className="text-sm font-semibold">Step 2: Streaming test (SSE)</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    UI chat → stream start/chunk/complete আসছে কি না। Chunk না এলে fullResponse fallback হচ্ছে কি না।
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4">
                  <div className="text-sm font-semibold">Step 3: Tool-call test</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Tools page → tool run → input/output trace। Agent-driven tool-call হলে trace log-এ [TOOL_CALL]/[TOOL_RESULT] দেখা উচিত।
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4">
                  <div className="text-sm font-semibold">Step 4: RAG test</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    RAG_ENABLED=true করে query দিন → prompt এ [RAG_CONTEXT] append হয়েছে কি না → vector-db page এ status/ingest count দেখুন।
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle id="source-of-truth">Source-of-Truth Files (বর্তমান authoritative কোড)</SectionTitle>
            <div className="space-y-3 text-sm leading-6">
              <SubTitle>Provider & Transport</SubTitle>
              <CodeBlock>
                {[
                  "server/src/services/providerGateway.ts  (provider routing + key resolution + streaming)",
                  "server/src/routes/providers.ts          (provider CRUD + test + sync models + key storage)",
                  "server/src/routes/chat.ts               (SSE endpoint + RAG injection + persistence)",
                  "server/src/services/websocket.ts        (WS transport; not SSE fallback)",
                ].join("\n")}
              </CodeBlock>

              <SubTitle>Tools</SubTitle>
              <CodeBlock>
                {[
                  "server/src/services/toolRegistry.ts     (tool definitions/registry)",
                  "server/src/services/tools.ts            (tool execution + parsing)",
                  "app/tools/page.tsx                      (admin tool runner UI)",
                  "app/api/proxy/mcp/tools/route.ts         (proxy list tools)",
                  "app/api/proxy/mcp/execute/route.ts       (proxy execute tool)",
                ].join("\n")}
              </CodeBlock>

              <SubTitle>RAG / Vector DB</SubTitle>
              <CodeBlock>
                {[
                  "server/src/services/qdrantManager.ts    (managed qdrant process)",
                  "server/src/services/ragService.ts       (ingest + retrieve)",
                  "server/src/services/ragAutoIndexer.ts   (watcher + auto ingest)",
                  "server/src/routes/status.ts             (diagnostics endpoint)",
                  "app/vector-db/page.tsx                  (admin monitoring UI)",
                ].join("\n")}
              </CodeBlock>
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle id="verification">Verification Checklist (আপনি কোড চেক করবেন)</SectionTitle>
            <div className="space-y-3 text-sm leading-6">
              <SubTitle>Provider keys</SubTitle>
              <div className="space-y-1 pl-4">
                <div>1) Provider create/update এ `config.apiKey` দিলে `system_settings.provider_api_key_PROVIDER_ID` এ encrypted value যাচ্ছে কি না</div>
                <div>2) `providerGateway.ts` DB-first resolve করছে কি না (decryptSecret + system_settings read)</div>
                <div>3) `PROVIDER_SECRETS_KEY` ছাড়া decrypt fail হলে clear error/log হচ্ছে কি না</div>
              </div>

              <SubTitle>Streaming truth</SubTitle>
              <div className="space-y-1 pl-4">
                <div>1) `/chat/stream` SSE start/chunk/complete/end consistent কি না</div>
                <div>2) Provider stream parse (OpenAI-compatible SSE) delta-content ঠিক আছে কি না</div>
                <div>3) Chunk না এলে finalText দিয়ে fullResponse fill হচ্ছে কি না</div>
              </div>

              <SubTitle>Tools truth</SubTitle>
              <div className="space-y-1 pl-4">
                <div>1) tool registry naming stable (no duplicates)</div>
                <div>2) tool execution logs: input/output/error/latency</div>
              </div>

              <SubTitle>RAG truth</SubTitle>
              <div className="space-y-1 pl-4">
                <div>1) RAG context injection: `[RAG_CONTEXT]` block present only when enabled</div>
                <div>2) vector-db status endpoint matches admin page output</div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-muted/30 p-5">
            <div className="text-sm font-semibold">Note</div>
            <div className="mt-2 text-sm text-muted-foreground">
              এই ডকুমেন্টটি “কথার” ডকুমেন্ট না—এটা এমনভাবে লেখা যাতে আপনি প্রতিটা claim কে code/file/route দিয়ে verify করতে পারেন।
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
