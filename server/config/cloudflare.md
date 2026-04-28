# Cloudflare Tunnel Config (single source of truth)

> এই ফাইলটি আপডেট করলেই `npm start` চলার সময় Public Gateway নতুন কনফিগ পড়ে নেবে।
> তারপর admin endpoint থেকে `/settings/services/public-gateway/reload` কল করলে সাথে সাথে কার্যকর হবে।
>
> Notes:
> - Tunnel service (`cloudflared service install ...`) আপনি ইতিমধ্যে ইনস্টল করেছেন।
> - এখানে শুধু Tunnel ID এবং Published application routes আপডেট করবেন।

## Tunnel Details

| Detail | Value |
| ----- | ----- |
| **Name** | **zombi** |
| **Tunnel ID** | **PUT-YOUR-TUNNEL-ID-HERE-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx** |
| **Type** | **cloudflared** |

## Configured Routes

| Type | Destination (Public Hostname) | Service (Internal Origin) | Description |
| ----- | ----- | ----- | ----- |
| Published application | [a.smartearningplatformbd.net](https://a.smartearningplatformbd.net/) | `http://127.0.0.1:8000` | API server |
| Published application | [lama.smartearningplatformbd.net](https://lama.smartearningplatformbd.net/) | `http://127.0.0.1:15000` | llama.cpp server |
| Published application | [smartearningplatformbd.net](https://smartearningplatformbd.net/) | `http://127.0.0.1:3000` | admin panel |
