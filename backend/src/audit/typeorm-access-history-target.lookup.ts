import { DataSource, In, ObjectLiteral, Repository } from 'typeorm';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { AppendixPool } from '../database/entities/appendix-pool.entity';
import { UsageFormPool } from '../database/entities/usage-form-pool.entity';
import { BusinessCategory } from '../database/entities/business-category.entity';
import { Account } from '../database/entities/account.entity';
import { lifecycleDisplayName } from '../lifecycle/lifecycle-subcategory';
import {
  AccessHistoryTargetLookup,
  DocumentRef,
  TargetLookupRequest,
  TargetLookupResult,
} from './access-history-target-label';

/**
 * MSSQL 單一語句之參數上限為 2100；匯出最多 10,000 列 ⇒ `IN (...)` 必須分批。
 */
const IN_CHUNK = 1000;

function chunks<T>(xs: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += IN_CHUNK) out.push(xs.slice(i, i + IN_CHUNK));
  return out;
}

async function findByIds<E extends ObjectLiteral & { id: string }>(
  repo: Repository<E>,
  ids: readonly string[],
  select: Record<string, true>,
): Promise<E[]> {
  const out: E[] = [];
  for (const part of chunks(ids)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out.push(...(await repo.find({ where: { id: In(part) } as any, select: select as any })));
  }
  return out;
}

/**
 * 🔴 2026-10-05 delta（H）：F024 對象欄補位之回查（唯讀、白名單欄位、依 id 批次 IN）。
 * 只讀**現值**，絕不回寫 AUDIT_LOG（append-only）。
 */
export class TypeOrmAccessHistoryTargetLookup implements AccessHistoryTargetLookup {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async lookup(req: TargetLookupRequest): Promise<TargetLookupResult> {
    const ds = await this.init();
    const documents = new Map<string, DocumentRef>();
    for (const d of await findByIds(ds.getRepository(IcsopDocument), req.documentIds, {
      id: true,
      documentNumber: true,
      documentName: true,
    })) {
      documents.set(d.id, { documentNumber: d.documentNumber, documentName: d.documentName });
    }
    const appendices = new Map<string, string>();
    for (const a of await findByIds(ds.getRepository(AppendixPool), req.appendixIds, {
      id: true,
      name: true,
    })) {
      appendices.set(a.id, a.name);
    }
    const usageForms = new Map<string, string>();
    for (const f of await findByIds(ds.getRepository(UsageFormPool), req.usageFormIds, {
      id: true,
      name: true,
    })) {
      usageForms.set(f.id, f.name);
    }
    const businessCategories = new Map<string, string>();
    for (const c of await findByIds(ds.getRepository(BusinessCategory), req.businessCategoryIds, {
      id: true,
      name: true,
      subcategory: true,
    })) {
      // 與寫入端快照同一顯示規則（含子分類），使補位值與新列之快照長得一樣。
      businessCategories.set(c.id, lifecycleDisplayName(c));
    }
    const accounts = new Map<string, { name: string | null; loginId: string }>();
    for (const a of await findByIds(ds.getRepository(Account), req.accountIds, {
      id: true,
      name: true,
      loginId: true,
    })) {
      accounts.set(a.id, { name: a.name, loginId: a.loginId });
    }
    return { documents, appendices, usageForms, businessCategories, accounts };
  }
}
