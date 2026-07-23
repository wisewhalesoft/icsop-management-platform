import { EmbeddingClient, EmbeddingResult } from './chunking.types';

/**
 * 測試用 embedder（維度不可知，deterministic）。
 * 依文字雜湊產生固定長度向量；**不預設任何真實模型維度**（真實選型＝ [integration] OQ-E09-02）。
 * `dimension` 由建構參數決定，供 TS-F029-010 驗證「VECTOR_EMBEDDING.dimension 與實際向量長度一致」。
 */
export class FakeEmbedder implements EmbeddingClient {
  readonly model: string;
  private readonly dimension: number;

  constructor(dimension = 8, model = 'fake-embedder@test') {
    this.dimension = dimension;
    this.model = model;
  }

  embed(text: string): Promise<EmbeddingResult> {
    const vector = new Array<number>(this.dimension);
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h = (h ^ text.charCodeAt(i)) * 16777619;
    }
    for (let d = 0; d < this.dimension; d++) {
      h = (h ^ (d + 1)) * 16777619;
      // 映射到 [-1,1]，deterministic。
      vector[d] = ((h >>> 0) % 2000) / 1000 - 1;
    }
    return Promise.resolve({ vector, dimension: this.dimension });
  }
}

/** 於第 N 次呼叫（1-based）拋出例外之 embedder（供 TS-F029-016 失敗注入）。 */
export class FailingEmbedder implements EmbeddingClient {
  readonly model = 'failing-embedder@test';
  private count = 0;
  constructor(
    private readonly failOnCall: number,
    private readonly delegate = new FakeEmbedder(),
  ) {}
  embed(text: string): Promise<EmbeddingResult> {
    this.count += 1;
    if (this.count === this.failOnCall) {
      return Promise.reject(new Error('EMBEDDING_FAILED: 模型呼叫失敗'));
    }
    return this.delegate.embed(text);
  }
}
