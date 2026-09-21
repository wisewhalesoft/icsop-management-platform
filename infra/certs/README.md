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
**Node.js 用的是自己內建的根憑證清單，不看 OS 的信任存放區**（已實測，無效）。

## 🔴 為什麼不用行程層環境變數（`NODE_EXTRA_CA_CERTS`）

第一版曾以 `ENV NODE_EXTRA_CA_CERTS=...` 實作，**那是錯的**，且被既有的安全 AC 擋下：

- **F001 `AC-E8`「TLS 憑證驗證不得以任何方式關閉」把該環境變數列入禁用清單**，其合成違規樣本
  逐字即 `ENV NODE_EXTRA_CA_CERTS=/tmp/mitm.pem` —— 作者**明確預想過**注入 MITM 根 CA 這個情境。
- 🔴 **它擋對了。** 該 `ENV` 會留在**執行中的容器**裡 ⇒ 本服務對 **Azure Blob／AAD／MSSQL 的
  每一條對外 TLS** 都會信任該攔截 CA。那是真的削弱，不是形式問題。
- ⇒ 現行作法改為 **`npm_config_cafile`**，且**只在安裝那一行的 shell 內生效**（不寫進 image、
  不設任何行程層環境變數）⇒ 信任範圍收窄為「**build 時的 npm registry 連線**」，
  執行中的容器不帶任何額外信任錨點。實測 `npm ci` 成功、容器內該環境變數未設定。
- 🔒 **不得改回行程層環境變數**；兩支 Dockerfile 的註解刻意**不複述**那個字面
  （`AC-E8` 的掃描不剝註解，複述會讓那條安全斷言對一段「解釋為何不用它」的註解誤報）。

⚠ 上一行本身就是這輪的教訓之一：**用法禁令若以裸字面掃描實作，會對「記錄該禁令的註解」誤報**
—— 所以字面只留在本檔（不在 `AC-E8` 的掃描範圍內），Dockerfile 只留指標。

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
