# === build stage ===
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# === runtime stage ===
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# ⚠ Bug 2（時區語意）：行程時區釘死為 UTC，與 data-source.ts 之 `useUTC: true` 為一組、缺一不可。
# MSSQL 之 datetime 欄位不帶時區資訊，行程時區一旦浮動，寫入/讀取兩端就可能各自解讀成不同瞬間。
# 本 ENV 亦涵蓋以同一 image 執行的一次性 init 服務（migration／seed-*／org-sync）——其中 org-sync
# 會寫入 SYNC_RUN.watermark 與 hireDate/resignDate，屬「影響資料正確性而非顯示」之路徑。
# ⚠ 勿於 .env 設定 TZ：env_file 之值會蓋過本 ENV（compose 已對各服務顯式再釘一次以防萬一）。
ENV TZ=UTC
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
# ⚠ 缺失 #6（architecture-spec §10.10 A10）：CJK 浮水印字型必須進 image，否則
# loadCjkFontBytes() 回 null → 退化 Helvetica + asciiSafe → 浮水印之中文全變 `?`。
# 置於 COPY --from=build 之前：assets 幾乎不變、dist 每次都變，不變的放前面才有 layer 快取效益。
# 不加到 build stage：build 只跑 tsc，字型不參與編譯，且 `COPY --from=build` 只帶 dist。
COPY assets ./assets
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
