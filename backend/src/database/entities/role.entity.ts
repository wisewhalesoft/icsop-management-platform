import { Column, Entity, PrimaryColumn } from 'typeorm';

/** 5 種固定角色（F025）。code 為固定列舉，作為 ACCOUNT.roleCode 之參照。 */
@Entity({ name: 'ROLE' })
export class Role {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  code!: string; // SysAdmin / ICSOPAdmin / Supervisor / DeptContact / User

  @Column({ type: 'nvarchar', length: 50 })
  name!: string;
}
