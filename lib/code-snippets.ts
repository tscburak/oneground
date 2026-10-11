import type { JsonStructure, QuestionsMap } from "@/lib/typesafe";

export type SnippetPayload = {
  state: JsonStructure;
  model: string;
  questions: QuestionsMap;
};

export type SnippetLanguage =
  | "json"
  | "curl"
  | "javascript"
  | "typescript"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "csharp"
  | "php"
  | "ruby";

export const SNIPPET_LANGUAGES: { id: SnippetLanguage; label: string }[] = [
  { id: "json", label: "JSON" },
  { id: "curl", label: "cURL" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "java", label: "Java" },
  { id: "csharp", label: "C#" },
  { id: "php", label: "PHP" },
  { id: "ruby", label: "Ruby" },
];

/** Same endpoint resolution as app/api/evaluate/route.ts */
export function resolveSystemOneUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  const url = new URL(trimmed);
  const path = url.pathname.replace(/\/+$/, "");
  if (!path.endsWith("/v1/systemone")) {
    url.pathname = `${path}${path.endsWith("/v1") ? "/systemone" : "/v1/systemone"}`;
  } else {
    url.pathname = path;
  }
  return url.toString().replace(/\/$/, "");
}

export function safeEndpoint(baseUrl: string): string | null {
  try {
    return resolveSystemOneUrl(baseUrl);
  } catch {
    return null;
  }
}

function rustRawString(value: string): string {
  if (!value.includes('"#')) return `r#"${value}"#`;
  if (!value.includes('"##')) return `r##"${value}"##`;
  return `r###"${value}"###`;
}

function shellSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function getSnippet(
  language: SnippetLanguage,
  endpointUrl: string,
  payload: SnippetPayload,
): string {
  const json = JSON.stringify(payload, null, 2);

  switch (language) {
    case "json":
      return json;

    case "curl":
      return [
        `curl -X POST "${endpointUrl}" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -H "Authorization: Bearer $TYPESAFE_API_KEY" \\`,
        `  -d ${shellSingleQuoted(json)}`,
      ].join("\n");

    case "javascript":
      return [
        `const payload = ${json};`,
        ``,
        `const res = await fetch("${endpointUrl}", {`,
        `  method: "POST",`,
        `  headers: {`,
        `    "Content-Type": "application/json",`,
        `    Authorization: \`Bearer \${process.env.TYPESAFE_API_KEY}\`,`,
        `  },`,
        `  body: JSON.stringify(payload),`,
        `});`,
        ``,
        `if (!res.ok) throw new Error(\`Request failed: \${res.status}\`);`,
        `const data = await res.json();`,
        `console.log(data.answers);`,
      ].join("\n");

    case "typescript":
      return [
        `import type { QuestionsMap, JsonStructure } from "@typesafe-ai/sdk";`,
        ``,
        `const payload: { state: JsonStructure; model: string; questions: QuestionsMap } = ${json};`,
        ``,
        `const res = await fetch("${endpointUrl}", {`,
        `  method: "POST",`,
        `  headers: {`,
        `    "Content-Type": "application/json",`,
        `    Authorization: \`Bearer \${process.env.TYPESAFE_API_KEY}\`,`,
        `  },`,
        `  body: JSON.stringify(payload),`,
        `});`,
        ``,
        `if (!res.ok) throw new Error(\`Request failed: \${res.status}\`);`,
        `const data = await res.json();`,
        `console.log(data.answers);`,
        ``,
        `// Or with the SDK: npm i @typesafe-ai/sdk`,
        `// import { TypeSafeClient } from "@typesafe-ai/sdk";`,
        `// const client = new TypeSafeClient();`,
        `// const out = await client.systemOne({ state: payload.state, questions: payload.questions, model: payload.model });`,
      ].join("\n");

    case "python":
      return [
        `import json`,
        `import os`,
        `import requests`,
        ``,
        `ENDPOINT = "${endpointUrl}"`,
        `payload = json.loads(r'''${json}''')`,
        ``,
        `res = requests.post(`,
        `    ENDPOINT,`,
        `    headers={`,
        `        "Content-Type": "application/json",`,
        `        "Authorization": f"Bearer {os.environ.get('TYPESAFE_API_KEY', '')}",`,
        `    },`,
        `    json=payload,`,
        `    timeout=30,`,
        `)`,
        `res.raise_for_status()`,
        `print(res.json()["answers"])`,
        ``,
        `# Or with the SDK: pip install typesafe-sdk`,
        `# from typesafe_sdk import TypeSafeClient`,
        `# with TypeSafeClient() as client:`,
        `#     out = client.system_one(state=payload["state"], questions=payload["questions"], model=payload["model"])`,
      ].join("\n");

    case "go":
      return [
        `package main`,
        ``,
        `import (`,
        `  "bytes"`,
        `  "encoding/json"`,
        `  "fmt"`,
        `  "net/http"`,
        `  "os"`,
        `)`,
        ``,
        `func main() {`,
        `  payload := \`${json}\``,
        ``,
        `  req, _ := http.NewRequest("POST", "${endpointUrl}", bytes.NewBuffer([]byte(payload)))`,
        `  req.Header.Set("Content-Type", "application/json")`,
        `  req.Header.Set("Authorization", "Bearer "+os.Getenv("TYPESAFE_API_KEY"))`,
        ``,
        `  res, err := http.DefaultClient.Do(req)`,
        `  if err != nil { panic(err) }`,
        `  defer res.Body.Close()`,
        `  if res.StatusCode >= 300 { panic(fmt.Sprint("request failed: ", res.Status)) }`,
        ``,
        `  var out map[string]any`,
        `  if err := json.NewDecoder(res.Body).Decode(&out); err != nil { panic(err) }`,
        `  fmt.Println(out["answers"])`,
        `}`,
      ].join("\n");

    case "rust":
      return [
        `#[tokio::main]`,
        `async fn main() -> Result<(), Box<dyn std::error::Error>> {`,
        `    let body = ${rustRawString(json)};`,
        ``,
        `    let res = reqwest::Client::new()`,
        `        .post("${endpointUrl}")`,
        `        .header("Content-Type", "application/json")`,
        `        .header(`,
        `            "Authorization",`,
        `            format!("Bearer {}", std::env::var("TYPESAFE_API_KEY")?),`,
        `        )`,
        `        .body(body.to_string())`,
        `        .send()`,
        `        .await?`,
        `        .error_for_status()?;`,
        ``,
        `    let out: serde_json::Value = res.json().await?;`,
        `    println!("{}", serde_json::to_string_pretty(&out["answers"])?);`,
        `    Ok(())`,
        `}`,
        `// Cargo: reqwest = { version = "0.12", features = ["json", "rustls-tls"] }, serde_json, tokio`,
      ].join("\n");

    case "java":
      return [
        `import java.net.URI;`,
        `import java.net.http.HttpClient;`,
        `import java.net.http.HttpRequest;`,
        `import java.net.http.HttpResponse;`,
        ``,
        `var payload = """`,
        `${json}`,
        `""";`,
        ``,
        `var request = HttpRequest.newBuilder()`,
        `    .uri(URI.create("${endpointUrl}"))`,
        `    .header("Content-Type", "application/json")`,
        `    .header("Authorization", "Bearer " + System.getenv("TYPESAFE_API_KEY"))`,
        `    .POST(HttpRequest.BodyPublishers.ofString(payload))`,
        `    .build();`,
        ``,
        `var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());`,
        `if (response.statusCode() >= 300) throw new RuntimeException("Request failed: " + response.statusCode());`,
        `System.out.println(response.body());`,
      ].join("\n");

    case "csharp":
      return [
        `using System.Net.Http.Headers;`,
        `using System.Text;`,
        ``,
        `var payload = """`,
        `${json}`,
        `""";`,
        ``,
        `using var client = new HttpClient();`,
        `client.DefaultRequestHeaders.Authorization =`,
        `    new AuthenticationHeaderValue("Bearer", Environment.GetEnvironmentVariable("TYPESAFE_API_KEY"));`,
        ``,
        `using var content = new StringContent(payload, Encoding.UTF8, "application/json");`,
        `using var res = await client.PostAsync("${endpointUrl}", content);`,
        `res.EnsureSuccessStatusCode();`,
        `Console.WriteLine(await res.Content.ReadAsStringAsync());`,
      ].join("\n");

    case "php":
      return [
        `<?php`,
        `$payload = <<<'JSON'`,
        `${json}`,
        `JSON;`,
        ``,
        `$ch = curl_init("${endpointUrl}");`,
        `curl_setopt_array($ch, [`,
        `    CURLOPT_RETURNTRANSFER => true,`,
        `    CURLOPT_POST => true,`,
        `    CURLOPT_HTTPHEADER => [`,
        `        'Content-Type: application/json',`,
        `        'Authorization: Bearer ' . getenv('TYPESAFE_API_KEY'),`,
        `    ],`,
        `    CURLOPT_POSTFIELDS => $payload,`,
        `    CURLOPT_TIMEOUT => 30,`,
        `]);`,
        `$body = curl_exec($ch);`,
        `$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);`,
        `curl_close($ch);`,
        `if ($status >= 300) { fwrite(STDERR, "Request failed: $status\\n"); exit(1); }`,
        `echo $body . PHP_EOL;`,
      ].join("\n");

    case "ruby":
      return [
        `require 'net/http'`,
        `require 'json'`,
        `require 'uri'`,
        ``,
        `payload = <<~'JSON'`,
        `  ${json.replace(/\n/g, "\n  ")}`,
        `JSON`,
        ``,
        `uri = URI("${endpointUrl}")`,
        `req = Net::HTTP::Post.new(uri)`,
        `req['Content-Type'] = 'application/json'`,
        `req['Authorization'] = "Bearer #{ENV['TYPESAFE_API_KEY']}"`,
        `req.body = payload`,
        ``,
        `res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == 'https') do |http|`,
        `  http.request(req)`,
        `end`,
        `raise "Request failed: #{res.code}" unless res.is_a?(Net::HTTPSuccess)`,
        `puts JSON.parse(res.body)['answers'].to_json`,
      ].join("\n");
  }
}
