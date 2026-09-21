# 公司 TLS 攔截之根 CA（可選、逐機器設定）

把公司的根憑證以 **PEM 格式**放成本目錄下的 `*.crt`，Docker build 就會自動信任它。
**憑證檔本身不進 git**（見 `.gitignore`）——它是環境相依的，每台機器自己放。

## 什麼時候需要

端點防毒（本機實測為 **Kaspersky Endpoint Security**）或網管設備對 HTTPS 做 SSL inspection 時，
容器內的 `npm ci` 會失敗，而 npm 只會印出一句**誤導性**的訊息：

```
npm error Exit handler never called!
```

真正的錯誤不在畫面上，在容器內的 `/root/.npm/_logs/*-debug-0.log` 裡，每一行都是：

```
http fetch GET https://registry.npmjs.org/... failed with SELF_SIGNED_CERT_IN_CHAIN
```

主機不會有這個問題（Windows 憑證存放區信任公司 CA），**只有容器會**。

## 🔴 只裝進 OS 信任存放區沒有用

`apk add ca-certificates && update-ca-certificates` **不會**解決這件事——
**Node.js 用的是自己內建的根憑證清單，不看 OS 的信任存放區**。必須走 `NODE_EXTRA_CA_CERTS`，
兩支 Dockerfile 已據此設定。

## 怎麼匯出（Windows / PowerShell）

先確認攔截者是誰：

```
docker run --rm alpine sh -c 'apk add --no-cache openssl >/dev/null 2>&1; \
  echo | openssl s_client -connect registry.npmjs.org:443 -servername registry.npmjs.org 2>/dev/null \
  | grep -E "^ *[0-9] s:|Verify return code"'
```

再依其 `CN` 自 Windows 憑證存放區匯出（以 Kaspersky 為例）：

```powershell
$c = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -like "*Kaspersky*" } | Select-Object -First 1
$b64 = [Convert]::ToBase64String($c.RawData, 'InsertLineBreaks')
[IO.File]::WriteAllText("infra\certs\corp-ca.crt",
  "-----BEGIN CERTIFICATE-----`n$b64`n-----END CERTIFICATE-----`n",
  (New-Object Text.UTF8Encoding $false))
```

## 沒有憑證時會怎樣

bundle 會是空檔，`NODE_EXTRA_CA_CERTS` 指向空檔時 **Node 靜默忽略、不噴警告**（已實測）。
⇒ 不在公司網路的機器不受本設定影響，不必做任何事。
