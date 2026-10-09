import { getTableName, sql, type Column, type SQL } from "drizzle-orm";

/**
 * Coluna sempre com o nome da tabela ("items"."id"). Use em subconsultas correlacionadas dentro de
 * campos do select: numa consulta de uma tabela só, o Drizzle escreve as colunas sem a tabela, e
 * "id" passaria a apontar para a tabela da subconsulta.
 */
export function col(c: Column): SQL {
  return sql.raw(`"${getTableName(c.table)}"."${c.name}"`);
}

/** Ambiente da montagem sem subníveis (um andar com apartamentos dentro não precisa de montador próprio). */
export function leafArea(): SQL {
  return sql.raw(`not exists (select 1 from "assembly_areas" k where k."parent_id" = "assembly_areas"."id")`);
}
